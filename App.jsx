import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import Gallery from './Gallery';

// 1. KEEP this as your Pi's IP. 
const SERVER_IP = "192.168.100.75";

// 2. PASTE YOUR VERCEL URL HERE
const VERCEL_URL = "https://pibooth.vercel.app";

// ---------------------------------------------------------------------------
// Design system: "Warm Studio Minimal"
// Combines the sharp, blur-free precision of modern cinema cameras with the 
// rich, warm tones of a vintage darkroom. Deep ink backgrounds, sharp brass 
// borders, cream paper accents, and a pulsing safelight red.
// ---------------------------------------------------------------------------

const FONT_IMPORTS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap');
`;

const STYLES = `
  ${FONT_IMPORTS}

  .pb-root {
    --ink: #0b0906;
    --panel: #1b160f;
    --panel-line: rgba(201,161,92,0.3);
    --brass: #c9a15c;
    --brass-dim: #8a723f;
    --paper: #f6efe1;
    --safelight: #e2532f;
    font-family: 'Inter', system-ui, sans-serif;
  }

  .pb-mono { font-family: 'Space Mono', ui-monospace, monospace; }

  /* Warm color grade for the camera feed */
  .pb-video {
    filter: contrast(1.06) saturate(0.88) brightness(0.94) sepia(0.06);
  }

  /* Optical Vignette Overlay - Deep ink fading to transparent, no blur */
  .pb-vignette {
    background: radial-gradient(circle, transparent 40%, var(--ink) 110%);
  }

  /* Camera Viewfinder Corners in Brass */
  .pb-viewfinder::before, .pb-viewfinder::after,
  .pb-viewfinder-inner::before, .pb-viewfinder-inner::after {
    content: '';
    position: absolute;
    width: 40px;
    height: 40px;
    border-color: var(--brass-dim);
    border-style: solid;
    opacity: 0.6;
  }
  .pb-viewfinder::before { top: 40px; left: 40px; border-width: 2px 0 0 2px; }
  .pb-viewfinder::after { top: 40px; right: 40px; border-width: 2px 2px 0 0; }
  .pb-viewfinder-inner::before { bottom: 40px; left: 40px; border-width: 0 0 2px 2px; }
  .pb-viewfinder-inner::after { bottom: 40px; right: 40px; border-width: 0 2px 2px 0; }

  @keyframes pb-pulse-safelight {
    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(226, 83, 47, 0.5); }
    50% { opacity: 0.6; box-shadow: 0 0 0 12px rgba(226, 83, 47, 0); }
  }
  .pb-record-dot { animation: pb-pulse-safelight 2s infinite ease-in-out; }

  @keyframes pb-flash {
    0% { opacity: 0; background: var(--paper); }
    10% { opacity: 1; }
    20% { opacity: 0; }
    100% { opacity: 0; }
  }
  .pb-flash-anim { animation: pb-flash 0.8s ease-out 1; }

  @keyframes pb-count-scale {
    0% { transform: scale(0.9); opacity: 0; }
    20% { transform: scale(1); opacity: 1; }
    80% { transform: scale(1); opacity: 1; }
    100% { transform: scale(1.05); opacity: 0; }
  }
  .pb-count-anim { animation: pb-count-scale 1s ease-in-out infinite; }

  @keyframes pb-slide-up {
    0% { transform: translateY(80px); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }
  .pb-slide-up-anim { animation: pb-slide-up 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
`;

function BoothUI() {
  const [boothState, setBoothState] = useState({
    status: "WAITING",
    capture_count: 0,
    remaining_time: 0,
    session_id: null
  });

  useEffect(() => {
    const ws = new WebSocket(`ws://${SERVER_IP}:8000/ws`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setBoothState(data);
    };
    return () => ws.close();
  }, []);

  const galleryUrl = boothState.session_id
    ? `${VERCEL_URL}/gallery/${boothState.session_id}`
    : '';

  return (
    <div className="pb-root relative w-screen h-screen bg-[var(--ink)] overflow-hidden selection:bg-[var(--brass)] selection:text-black">
      <style>{STYLES}</style>

      {/* Video feed */}
      <img
        src={`http://${SERVER_IP}:8000/video_feed`}
        className="pb-video absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
        alt="Live Camera Feed"
      />

      {/* Vignette (No Blur, pure gradient) */}
      <div className="pb-vignette absolute inset-0 pointer-events-none z-10" />

      {/* Viewfinder Corner Marks */}
      <div className="pb-viewfinder absolute inset-0 pointer-events-none z-10">
        <div className="pb-viewfinder-inner absolute inset-0" />
      </div>

      {/* Top Left: Sleek Brand Plate */}
      <div className="absolute top-10 left-10 z-50">
        <div className="flex items-center gap-3 px-5 py-2.5 rounded-full bg-[var(--panel)] border border-[var(--panel-line)] shadow-[0_10px_30px_rgba(11,9,6,0.8)]">
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--brass)]" />
          <span className="text-[var(--paper)] text-sm font-semibold tracking-widest uppercase">
            Pi<span className="font-light text-[var(--brass-dim)]">BOOTH</span>
          </span>
        </div>
      </div>

      {/* Top Right: Frame Counter */}
      <div className="absolute top-10 right-10 z-50">
        <div className="flex items-center gap-4 px-5 py-2.5 rounded-full bg-[var(--panel)] border border-[var(--panel-line)] shadow-[0_10px_30px_rgba(11,9,6,0.8)]">
          <span className="pb-mono text-[10px] tracking-[0.2em] text-[var(--brass-dim)] uppercase">
            SHOTS
          </span>
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((i) => {
              const exposed = boothState.capture_count > i;
              return (
                <span
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    exposed
                      ? 'bg-[var(--brass)] scale-100'
                      : 'bg-transparent border border-[var(--brass-dim)] scale-75'
                  }`}
                />
              );
            })}
          </div>
          <span className="pb-mono text-[11px] font-bold text-[var(--paper)]">
            {String(boothState.capture_count).padStart(2, '0')}/04
          </span>
        </div>
      </div>

      {/* State: WAITING */}
      {boothState.status === "WAITING" && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-4 px-8 py-4 rounded-full bg-[var(--panel)] border border-[var(--panel-line)] shadow-[0_15px_40px_rgba(11,9,6,0.9)]">
            <div className="pb-record-dot w-3 h-3 rounded-full bg-[var(--safelight)]" />
            <span className="pb-mono text-[var(--paper)] text-xs font-bold tracking-[0.25em] uppercase">
              Raise open palm to start
            </span>
          </div>
        </div>
      )}

      {/* State: COUNTDOWN */}
      {boothState.status === "COUNTDOWN" && (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
          <span
            key={Math.ceil(boothState.remaining_time)}
            className="pb-count-anim text-[var(--paper)] text-[12rem] font-light leading-none tracking-tighter drop-shadow-[0_10px_40px_rgba(11,9,6,0.8)]"
          >
            {Math.ceil(boothState.remaining_time)}
          </span>
        </div>
      )}

      {/* State: CAPTURING */}
      {boothState.status === "CAPTURING" && (
        <div className="pb-flash-anim absolute inset-0 z-[100] pointer-events-none" />
      )}

      {/* State: SHOW_QR — Premium clean card reveal, darkroom colors */}
      {boothState.status === "SHOW_QR" && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/85">
          <div className="pb-slide-up-anim flex flex-col items-center">
            
            {/* The Print Card */}
            <div className="bg-[var(--paper)] p-10 rounded-xl shadow-[0_30px_100px_rgba(0,0,0,1)] border border-[var(--brass-dim)]/20 flex flex-col items-center w-[22rem]">
              <h2 className="text-[var(--ink)] text-2xl font-semibold tracking-tight mb-1">
                Photos Ready
              </h2>
              <p className="pb-mono text-[10px] font-bold tracking-[0.2em] text-[var(--brass-dim)] mb-8 uppercase">
                Scan to download
              </p>

              <div className="bg-[#fffcf5] p-4 rounded-lg border border-[var(--panel-line)] mb-8 shadow-inner">
                <QRCode
                  value={galleryUrl}
                  size={200}
                  bgColor="transparent"
                  fgColor="#0b0906"
                  level="Q"
                />
              </div>
              
              <div className="w-full h-[1px] bg-[var(--panel-line)] mb-4" />
              
              <span className="pb-mono text-[10px] tracking-[0.1em] text-[var(--brass-dim)]">
                Resets in {Math.ceil(boothState.remaining_time)}s
              </span>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const path = window.location.pathname;

  if (path.startsWith('/gallery/')) {
    const sessionId = path.split('/')[2];
    return <Gallery sessionId={sessionId} />;
  }

  return <BoothUI />;
}







// import { useState, useEffect } from 'react';
// import QRCode from 'react-qr-code';
// import Gallery from './Gallery';

// // Change this to your Pi's actual IP
// const SERVER_IP = "192.168.100.75"; 

// function BoothUI() {
//   const [boothState, setBoothState] = useState({
//     status: "WAITING",
//     capture_count: 0,
//     remaining_time: 0,
//     session_id: null
//   });

//   useEffect(() => {
//     const ws = new WebSocket(`ws://${SERVER_IP}:8000/ws`);
//     ws.onmessage = (event) => {
//       const data = JSON.parse(event.data);
//       setBoothState(data);
//     };
//     return () => ws.close();
//   }, []);

//   const fireTestTrigger = async () => {
//     try {
//       await fetch(`http://${SERVER_IP}:8000/test-trigger`);
//     } catch (error) {
//       console.error("Failed to hit test trigger:", error);
//     }
//   };

//   return (
//     <div className="relative w-screen h-screen bg-[#15130f] overflow-hidden selection:bg-[#ff5a2e] selection:text-black">
      
//       {/* 1. Video Feed */}
//       <img 
//         src={`http://${SERVER_IP}:8000/video_feed`} 
//         className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
//         alt="Live Camera Feed"
//       />

//       {/* 2. Vignette Overlay (Darkens edges to simulate an old camera lens) */}
//       <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_150px_rgba(10,9,8,0.85)] z-10" />

//       {/* 3. Dev Tools & Branding */}
//       <div className="absolute top-8 left-8 flex items-center gap-6 z-50">
//         <div className="text-[#f4ede2] font-serif italic text-3xl tracking-wide drop-shadow-lg flex items-center gap-3">
//           <span className="w-3 h-3 rounded-full bg-[#ff5a2e] shadow-[0_0_10px_rgba(255,90,46,0.8)] animate-pulse"></span>
//           PiBooth
//         </div>
//         <button 
//           onClick={fireTestTrigger}
//           className="px-4 py-2 bg-[#ff5a2e] hover:bg-[#ff7a52] text-[#15130f] font-mono text-xs font-black rounded shadow transition-transform active:scale-95 cursor-pointer uppercase tracking-widest border-none"
//         >
//           Force Trigger
//         </button>
//       </div>

//       {/* 4. Film Frame Tracker (Top Right) */}
//       <div className="absolute top-10 right-10 flex gap-3 z-50">
//         {[0, 1, 2, 3].map((frameIndex) => (
//           <div 
//             key={frameIndex} 
//             className={`w-3.5 h-3.5 rounded-sm transform rotate-45 transition-all duration-300 ${
//               boothState.capture_count > frameIndex 
//                 ? 'bg-[#ff5a2e] shadow-[0_0_12px_rgba(255,90,46,0.6)]' 
//                 : 'bg-transparent border border-[#b8ab9a]/50'
//             }`} 
//           />
//         ))}
//       </div>

//       {/* State: WAITING */}
//       {boothState.status === "WAITING" && (
//         <div className="absolute bottom-16 left-1/2 -translate-x-1/2 transition-opacity duration-500 z-50">
//           <div className="px-8 py-4 rounded-full bg-[#1d1a15]/80 backdrop-blur-md border border-[#b8ab9a]/30 shadow-2xl flex items-center gap-4">
//             <span className="text-[#f4ede2] font-mono text-lg tracking-widest uppercase opacity-90 drop-shadow-md">
//               Show an open palm to start
//             </span>
//           </div>
//         </div>
//       )}

//       {/* State: COUNTDOWN */}
//       {boothState.status === "COUNTDOWN" && (
//         <div className="absolute inset-0 flex items-center justify-center z-50">
//           <div className="relative flex items-center justify-center w-64 h-64 rounded-full border border-[#b8ab9a]/20 bg-[#1d1a15]/40 backdrop-blur-sm">
//             {/* Pulsing Safelight Ring */}
//             <div className="absolute inset-0 rounded-full border-8 border-[#ff5a2e] shadow-[0_0_40px_rgba(255,90,46,0.5)] animate-pulse" />
//             <span className="text-[#f4ede2] text-9xl font-serif italic drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
//               {Math.ceil(boothState.remaining_time)}
//             </span>
//           </div>
//         </div>
//       )}

//       {/* State: CAPTURING (Camera Flash) */}
//       {boothState.status === "CAPTURING" && (
//         <div className="absolute inset-0 bg-white z-[100] animate-[ping_0.5s_cubic-bezier(0,0,0.2,1)_1]" />
//       )}

//       {/* State: SHOW_QR */}
//       {boothState.status === "SHOW_QR" && (
//         <div className="absolute inset-0 flex items-center justify-center z-50 bg-[#15130f]/80 backdrop-blur-md transition-all duration-500">
//           <div className="bg-[#1d1a15] border border-[#b8ab9a]/30 p-10 rounded-2xl shadow-2xl flex flex-col items-center">
            
//             <h2 className="text-[#ff5a2e] font-serif italic text-4xl mb-2 drop-shadow-md">
//               Scan to Save
//             </h2>
            
//             <p className="text-[#b8ab9a] font-mono text-sm mb-8 tracking-widest uppercase">
//               Resets in {Math.ceil(boothState.remaining_time)}s
//             </p>

//             <div className="bg-[#f4ede2] p-4 rounded-xl shadow-inner">
//               <QRCode
//                 value={`http://${SERVER_IP}:5173/gallery/${boothState.session_id}`}
//                 size={220}
//                 bgColor="#f4ede2"
//                 fgColor="#15130f"
//                 level="Q"
//               />
//             </div>
            
//           </div>
//         </div>
//       )}

//     </div>
//   );
// }

// export default function App() {
//   const path = window.location.pathname;

//   // Simple router: If URL is /gallery/UUID, show the gallery
//   if (path.startsWith('/gallery/')) {
//     const sessionId = path.split('/')[2];
//     return <Gallery sessionId={sessionId} />;
//   }

//   // Otherwise, show the photobooth
//   return <BoothUI />;
// }