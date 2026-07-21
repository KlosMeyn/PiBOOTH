import cv2
import mediapipe as mp
import time
import asyncio
import uuid
import os
import threading
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

# ==========================================
# SUPABASE CONFIGURATION
# ==========================================
from supabase import create_client, Client

SUPABASE_URL = "https://itdlszsqnjhjgqwjvjrd.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZGxzenNxbmpoamdxd2p2anJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNjYxOTEsImV4cCI6MjA5OTg0MjE5MX0.rxSY6ReprTVXn2Sa5ds8go5QazLsniZcVMMkvtA6eOU"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def upload_to_cloud(local_filepath, session_id, filename):
    """Uploads a single photo to the Supabase storage bucket in the background."""
    try:
        cloud_path = f"{session_id}/{filename}"
        with open(local_filepath, 'rb') as f:
            supabase.storage.from_("pibooth").upload(
                file=f, 
                path=cloud_path, 
                file_options={"content-type": "image/jpeg"}
            )
        print(f"Cloud upload successful: {cloud_path}")
    except Exception as e:
        print(f"Cloud upload failed for {filename}: {e}")

# ==========================================
# GLOBAL STATE & TRACKING
# ==========================================
state = {
    "status": "WAITING", 
    "capture_count": 0,
    "remaining_time": 0,
    "session_id": None,
    "position_feedback": "Step into Frame" 
}
current_frame = None
frame_lock = threading.Lock()
force_trigger = False 

active_websockets = []

# ==========================================
# ASYNC BROADCASTER
# ==========================================
async def broadcast_state_loop():
    """Loops at 10Hz and securely updates all connected UIs at the same time."""
    while True:
        if active_websockets:
            for websocket in list(active_websockets):
                try:
                    await websocket.send_json(state)
                except Exception:
                    if websocket in active_websockets:
                        active_websockets.remove(websocket)
        await asyncio.sleep(0.1)

@asynccontextmanager
async def lifespan(app: FastAPI):
    broadcast_task = asyncio.create_task(broadcast_state_loop())
    yield
    broadcast_task.cancel()

# ==========================================
# FASTAPI INITIALIZATION & CONFIG
# ==========================================
app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("sessions", exist_ok=True)
app.mount("/sessions", StaticFiles(directory="sessions"), name="sessions")

# ==========================================
# BACKGROUND CAMERA THREAD
# ==========================================
def camera_loop():
    global state, current_frame, force_trigger
    
    mp_hands = mp.solutions.hands
    mp_drawing = mp.solutions.drawing_utils 
    hands = mp_hands.Hands(max_num_hands=1, min_detection_confidence=0.7, min_tracking_confidence=0.7)

    mp_face_detection = mp.solutions.face_detection
    face_detection = mp_face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.7)

    countdown_start = 0
    SHOT_DELAY = 3
    
    print("Initializing Raspberry Pi Camera Module...")
    
    cap = None
    for i in range(4):
        print(f"Testing camera index {i}...")
        temp_cap = cv2.VideoCapture(i, cv2.CAP_V4L2)
        
        if temp_cap.isOpened():
            temp_cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            temp_cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            temp_cap.set(cv2.CAP_PROP_FPS, 30)
            temp_cap.set(cv2.CAP_PROP_BRIGHTNESS, 65) 
            temp_cap.set(cv2.CAP_PROP_CONTRAST, 60)   

            success = False
            for attempt in range(10):
                success, test_frame = temp_cap.read()
                if success and test_frame is not None:
                    break
                print(f"  Wait for warmup (attempt {attempt + 1}/10)...")
                time.sleep(0.2)
                
            if success:
                print(f"SUCCESS: Connected to Pi camera at index {i}")
                cap = temp_cap
                break
            else:
                print(f"Index {i} opened, but returned no frames after waiting. Skipping.")
        temp_cap.release()

    if cap is None or not cap.isOpened():
        print("ERROR: Could not open the Raspberry Pi Camera Module.")
        return
    
    print("Pi Camera and Vision thread running...")

    while True:
        success, frame = cap.read()
        
        if not success:
            print("Failed to grab frame from Pi camera. Retrying...")
            time.sleep(0.1)
            continue
            
        current_status = state["status"]
        hand_detected = False

        # ---------------------------------------------------------
        # AI VISION LOGIC
        # ---------------------------------------------------------
        if current_status in ["WAITING", "COUNTDOWN"]:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # 1. POSITIONING FEEDBACK (FACE DETECTION)
            face_results = face_detection.process(rgb_frame)
            feedback = "Step into Frame"
            
            if face_results.detections:
                largest_face = max(face_results.detections, 
                                   key=lambda d: d.location_data.relative_bounding_box.width * d.location_data.relative_bounding_box.height)
                bbox = largest_face.location_data.relative_bounding_box
                center_x = bbox.xmin + (bbox.width / 2)
                
                # --- NEW: STRICT WARNING TEXT ---
                if bbox.height > 0.45:
                    feedback = "Too Close"
                elif bbox.height < 0.12:
                    feedback = "Too Far"
                elif center_x < 0.25 or center_x > 0.75:
                    feedback = "Center Yourself"
                else:
                    feedback = "Perfect!"
                    
            state["position_feedback"] = feedback

            # 2. TRIGGER GESTURE
            if current_status == "WAITING":
                results = hands.process(rgb_frame)
                
                if results.multi_hand_landmarks:
                    for hand_landmarks in results.multi_hand_landmarks:
                        mp_drawing.draw_landmarks(
                            frame, 
                            hand_landmarks, 
                            mp_hands.HAND_CONNECTIONS
                        )
                        
                        finger_tips = [8, 12, 16, 20]
                        finger_pips = [6, 10, 14, 18] 
                        
                        is_open_palm = True
                        for tip, pip in zip(finger_tips, finger_pips):
                            if hand_landmarks.landmark[tip].y > hand_landmarks.landmark[pip].y:
                                is_open_palm = False
                                break
                        
                        if is_open_palm:
                            hand_detected = True

        # State Machine Transitions
        if current_status == "WAITING":
            if force_trigger or hand_detected:
                state["status"] = "COUNTDOWN"
                state["session_id"] = str(uuid.uuid4())
                countdown_start = time.time()
                force_trigger = False 
                print(f"Started new session: {state['session_id']}")

        elif current_status == "COUNTDOWN":
            elapsed = time.time() - countdown_start
            remaining = SHOT_DELAY - elapsed
            state["remaining_time"] = max(0, remaining)
            
            if remaining <= 0:
                state["status"] = "CAPTURING"
                state["position_feedback"] = "" 
                session_path = f"sessions/{state['session_id']}"
                os.makedirs(session_path, exist_ok=True)
                
                photo_name = f"photo_{state['capture_count'] + 1}.jpg"
                filename = f"{session_path}/{photo_name}"
                
                final_photo = cv2.flip(frame, 1)
                cv2.imwrite(filename, final_photo)
                
                threading.Thread(
                    target=upload_to_cloud, 
                    args=(filename, state['session_id'], photo_name),
                    daemon=True
                ).start()
                
                state["capture_count"] += 1
                time.sleep(0.5) 
                
                if state["capture_count"] < 4:
                    state["status"] = "COUNTDOWN"
                    countdown_start = time.time()
                else:
                    state["status"] = "SHOW_QR"
                    countdown_start = time.time() 
                    state["capture_count"] = 0

        elif current_status == "SHOW_QR":
            state["position_feedback"] = "" 
            QR_DURATION = 15
            elapsed = time.time() - countdown_start
            remaining = QR_DURATION - elapsed
            state["remaining_time"] = max(0, remaining)
            
            if remaining <= 0:
                state["status"] = "WAITING"

        with frame_lock:
            current_frame = frame.copy()

thread = threading.Thread(target=camera_loop, daemon=True)
thread.start()

# ==========================================
# FASTAPI ENDPOINTS
# ==========================================
async def generate_frames():
    global current_frame
    while True:
        with frame_lock:
            if current_frame is None:
                await asyncio.sleep(0.1)
                continue
            ret, buffer = cv2.imencode('.jpg', current_frame)
            
        if not ret:
            continue
            
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        await asyncio.sleep(0.03) 

@app.get("/video_feed")
async def video_feed():
    return StreamingResponse(generate_frames(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in active_websockets:
            active_websockets.remove(websocket)

@app.get("/test-trigger")
async def trigger_photobooth():
    global force_trigger
    force_trigger = True
    return {"message": "Triggered"}

@app.get("/api/gallery/{session_id}")
async def get_gallery_images(session_id: str):
    session_path = f"sessions/{session_id}"
    if not os.path.exists(session_path):
        return {"error": "Session not found", "images": []}
    
    images = [f"{SUPABASE_URL}/storage/v1/object/public/pibooth/{session_id}/{img}" 
              for img in sorted(os.listdir(session_path)) if img.endswith(".jpg")]
    
    return {"images": images}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
