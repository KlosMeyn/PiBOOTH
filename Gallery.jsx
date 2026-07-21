import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// HARDCODED SUPABASE CONFIGURATION
// ==========================================
const SUPABASE_URL = "https://itdlszsqnjhjgqwjvjrd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZGxzenNxbmpoamdxd2p2anJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNjYxOTEsImV4cCI6MjA5OTg0MjE5MX0.rxSY6ReprTVXn2Sa5ds8go5QazLsniZcVMMkvtA6eOU";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const FILTERS = [
  { label: 'RAW', value: 'none' },
  { label: 'MONO', value: 'grayscale(100%)' },
  { label: 'SEPIA', value: 'sepia(80%)' },
  { label: 'STUDIO', value: 'contrast(1.2) saturate(1.4) sepia(0.3)' }
];

// ---------------------------------------------------------------------------
// Design system: "Warm Studio Minimal" (Gallery View)
// Deep ink backgrounds, sharp 1px brass borders, cream paper typography.
// Zero blurs. Acts as a high-end digital proofing sheet.
// ---------------------------------------------------------------------------

const FONT_IMPORTS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap');
`;

const STYLES = `
  ${FONT_IMPORTS}

  .gal-root {
    --ink: #0b0906;
    --panel: #1b160f;
    --panel-line: rgba(201,161,92,0.3);
    --brass: #c9a15c;
    --brass-dim: #8a723f;
    --paper: #f6efe1;
    --safelight: #e2532f;
    font-family: 'Inter', system-ui, sans-serif;
  }

  .gal-mono { font-family: 'Space Mono', ui-monospace, monospace; }

  @keyframes gal-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .gal-loading-dot { animation: gal-pulse 1.5s infinite ease-in-out; }

  @keyframes gal-slide-up {
    0% { transform: translateY(20px); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }
  .gal-anim-item {
    opacity: 0;
    animation: gal-slide-up 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  }
`;

export default function Gallery({ sessionId }) {
  const [images, setImages] = useState([]);
  const [activeFilter, setActiveFilter] = useState('none');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchImages() {
      try {
        const { data, error } = await supabase
          .storage
          .from('pibooth')
          .list(sessionId, {
            sortBy: { column: 'name', order: 'asc' }
          });

        if (error) throw error;

        if (data && data.length > 0) {
          const validFiles = data.filter(file => file.name.endsWith('.jpg'));
          
          const photoUrls = validFiles.map((file) => {
            const { data: publicUrlData } = supabase
              .storage
              .from('pibooth')
              .getPublicUrl(`${sessionId}/${file.name}`);
            return publicUrlData.publicUrl;
          });

          setImages(photoUrls);
        }
      } catch (error) {
        console.error("Failed to load gallery from Supabase:", error);
      } finally {
        setLoading(false);
      }
    }

    if (sessionId) fetchImages();
  }, [sessionId]);

  const downloadSingle = async (imgSrc, index) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imgSrc;
      await new Promise(resolve => { img.onload = resolve; });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      
      ctx.filter = activeFilter;
      ctx.drawImage(img, 0, 0);
      
      const link = document.createElement('a');
      link.download = `studiobooth_frame_${String(index + 1).padStart(2, '0')}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    } catch (err) {
      console.error("Failed to download image", err);
    }
  };

  const downloadCollage = async () => {
    if (images.length === 0) return;
    
    const loadedImages = await Promise.all(images.map(src => {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.src = src;
      });
    }));

    const w = loadedImages[0].naturalWidth;
    const h = loadedImages[0].naturalHeight;
    const padding = 40;

    const canvas = document.createElement('canvas');
    canvas.width = w + (padding * 2);
    canvas.height = (h * loadedImages.length) + (padding * (loadedImages.length + 1));
    const ctx = canvas.getContext('2d');

    // Deep ink background for the collage
    ctx.fillStyle = '#0b0906';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.filter = activeFilter;

    loadedImages.forEach((img, i) => {
      const y = padding + i * (h + padding);
      ctx.drawImage(img, padding, y, w, h);
    });

    const link = document.createElement('a');
    link.download = `studiobooth_sheet_${sessionId}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
  };

  // Loading State
  if (loading) {
    return (
      <div className="gal-root min-h-screen bg-[var(--ink)] flex flex-col items-center justify-center">
        <style>{STYLES}</style>
        <div className="flex items-center gap-3">
          <div className="gal-loading-dot w-2.5 h-2.5 rounded-full bg-[var(--brass)]" />
          <span className="gal-mono text-[var(--paper)] text-xs tracking-[0.2em] uppercase">
            Fetching Session Data
          </span>
        </div>
      </div>
    );
  }
  
  // Empty State
  if (images.length === 0) {
    return (
      <div className="gal-root min-h-screen bg-[var(--ink)] flex flex-col items-center justify-center p-6 text-center">
        <style>{STYLES}</style>
        <div className="border border-[var(--panel-line)] bg-[var(--panel)] p-8 w-full max-w-md flex flex-col items-center">
          <span className="gal-mono text-[var(--safelight)] text-xs tracking-[0.2em] mb-4 uppercase">
            Error 404
          </span>
          <h1 className="text-[var(--paper)] text-xl font-medium tracking-tight mb-2">
            Session Not Found
          </h1>
          <p className="text-[var(--brass-dim)] text-sm">
            This session may have expired or never existed.
          </p>
        </div>
      </div>
    );
  }

  // Active Gallery State
  return (
    <div className="gal-root min-h-screen bg-[var(--ink)] text-[var(--paper)] selection:bg-[var(--brass)] selection:text-[var(--ink)] pb-24">
      <style>{STYLES}</style>

      {/* Top Navigation / Brand Plate */}
     <div className="sticky top-0 z-50 bg-black border-b border-[var(--panel-line)] px-4 py-4 mb-8">
  <div className="max-w-[460px] mx-auto flex items-center justify-between">
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-[var(--safelight)]" />
      <span className="text-[var(--paper)] text-xs font-semibold tracking-widest uppercase">
        Pi<span className="font-light text-[var(--brass-dim)]">BOOTH</span>
      </span>
    </div>
    <span className="gal-mono text-[10px] tracking-[0.2em] text-[var(--brass-dim)] uppercase">
      Proof Sheet
    </span>
  </div>
</div>

      <div className="max-w-[460px] mx-auto px-4">
        
        {/* Controls Panel */}
        <div className="border border-[var(--panel-line)] bg-[var(--panel)] p-5 mb-6 flex flex-col gap-5">
          <div className="flex justify-between items-center">
            <span className="gal-mono text-[10px] tracking-[0.2em] text-[var(--brass-dim)] uppercase">
              Filter Grade
            </span>
            <span className="gal-mono text-[10px] tracking-[0.2em] text-[var(--brass-dim)] uppercase">
              {images.length} Frames
            </span>
          </div>
          
          <div className="grid grid-cols-4 gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.label}
                onClick={() => setActiveFilter(f.value)}
                className={`gal-mono py-2 text-[10px] tracking-widest uppercase transition-colors border ${
                  activeFilter === f.value 
                    ? 'bg-[var(--brass)] text-[var(--ink)] border-[var(--brass)] font-bold' 
                    : 'bg-transparent text-[var(--paper)] border-[var(--panel-line)] hover:border-[var(--brass-dim)]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button 
            onClick={downloadCollage}
            className="w-full bg-[var(--safelight)] text-[var(--paper)] py-3 gal-mono text-xs font-bold tracking-[0.15em] uppercase border border-[var(--safelight)] transition-transform active:scale-[0.98]"
          >
            Export Sheet
          </button>
        </div>

        {/* Frames Grid */}
        <div className="flex flex-col gap-6">
          {images.map((src, index) => (
            <div 
              key={index} 
              className="gal-anim-item border border-[var(--panel-line)] bg-[var(--panel)] p-3"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Frame Metadata */}
              <div className="flex justify-between items-center mb-3 px-1">
                <span className="gal-mono text-[10px] tracking-[0.2em] text-[var(--brass-dim)] uppercase">
                  Frame {String(index + 1).padStart(2, '0')}
                </span>
                <button 
                  onClick={() => downloadSingle(src, index)}
                  className="gal-mono text-[10px] tracking-[0.2em] text-[var(--brass)] uppercase hover:text-[var(--paper)] transition-colors"
                >
                  [ Save ]
                </button>
              </div>

              {/* Image Container */}
              <div className="relative border border-[var(--panel-line)]/50 bg-[var(--ink)] overflow-hidden group">
                <img 
                  src={src} 
                  alt={`Frame ${index + 1}`} 
                  style={{ filter: activeFilter }} 
                  crossOrigin="anonymous" 
                  className="block w-full h-auto transition-all duration-300 group-hover:scale-[1.02]"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Footer Hint */}
        <div className="mt-12 mb-8 text-center border-t border-[var(--panel-line)] pt-6">
          <span className="gal-mono text-[10px] tracking-[0.2em] text-[var(--brass-dim)] uppercase block mb-1">
            End of Roll
          </span>
          <span className="text-[var(--paper)] text-xs">
            Bookmark this URL to access your proofs later.
          </span>
        </div>

      </div>
    </div>
  );
}










// import { useState, useEffect } from 'react';

// const SERVER_IP = "192.168.100.75";
// const FILTERS = [
//   { label: 'Normal', value: 'none' },
//   { label: 'B&W', value: 'grayscale(100%)' },
//   { label: 'Sepia', value: 'sepia(80%)' },
//   { label: 'Vintage', value: 'contrast(1.2) saturate(1.4) sepia(0.3)' }
// ];

// export default function Gallery({ sessionId }) {
//   const [images, setImages] = useState([]);
//   const [activeFilter, setActiveFilter] = useState('none');
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     async function fetchImages() {
//       try {
//         const response = await fetch(`http://${SERVER_IP}:8000/api/gallery/${sessionId}`);
//         const data = await response.json();
//         if (data.images) {
//           setImages(data.images);
//         }
//       } catch (error) {
//         console.error("Failed to load gallery:", error);
//       } finally {
//         setLoading(false);
//       }
//     }
//     fetchImages();
//   }, [sessionId]);

//   const sprockets = Array.from({ length: 14 }).map((_, i) => (
//     <span key={i} className="w-[9px] h-[9px] rounded-[2px] bg-[#15130f]"></span>
//   ));

//   const downloadSingle = async (imgSrc, index) => {
//     try {
//       const img = new Image();
//       img.crossOrigin = 'anonymous';
//       img.src = imgSrc;
//       await new Promise(resolve => { img.onload = resolve; });

//       const canvas = document.createElement('canvas');
//       canvas.width = img.naturalWidth;
//       canvas.height = img.naturalHeight;
//       const ctx = canvas.getContext('2d');
      
//       ctx.filter = activeFilter;
//       ctx.drawImage(img, 0, 0);
      
//       const link = document.createElement('a');
//       link.download = `pibooth_photo_${index + 1}.jpg`;
//       link.href = canvas.toDataURL('image/jpeg', 0.95);
//       link.click();
//     } catch (err) {
//       console.error("Failed to download image", err);
//     }
//   };

//   const downloadCollage = async () => {
//     if (images.length === 0) return;
    
//     const loadedImages = await Promise.all(images.map(src => {
//       return new Promise((resolve) => {
//         const img = new Image();
//         img.crossOrigin = 'anonymous';
//         img.onload = () => resolve(img);
//         img.src = src;
//       });
//     }));

//     const w = loadedImages[0].naturalWidth;
//     const h = loadedImages[0].naturalHeight;
//     const padding = 40;

//     const canvas = document.createElement('canvas');
//     canvas.width = w + (padding * 2);
//     canvas.height = (h * loadedImages.length) + (padding * (loadedImages.length + 1));
//     const ctx = canvas.getContext('2d');

//     // Solid black film strip background
//     ctx.fillStyle = '#0a0908';
//     ctx.fillRect(0, 0, canvas.width, canvas.height);
//     ctx.filter = activeFilter;

//     loadedImages.forEach((img, i) => {
//       const y = padding + i * (h + padding);
//       ctx.drawImage(img, padding, y, w, h);
//     });

//     const link = document.createElement('a');
//     link.download = `pibooth_strip_${sessionId}.jpg`;
//     link.href = canvas.toDataURL('image/jpeg', 0.95);
//     link.click();
//   };

//   if (loading) return <div className="min-h-screen bg-[#15130f] text-[#f4ede2] flex items-center justify-center font-mono">Developing...</div>;
  
//   if (images.length === 0) {
//     return (
//       <div className="min-h-screen flex flex-col items-center justify-center text-center bg-[#15130f] text-[#f4ede2]">
//         <h1 className="font-serif italic font-normal text-[#ff5a2e] text-3xl">Roll Not Found</h1>
//         <p className="font-mono mt-2">This strip has expired or never existed.</p>
//       </div>
//     );
//   }

//   return (
//     <div className="min-h-screen bg-[#15130f] bg-[radial-gradient(ellipse_at_top,rgba(255,90,46,0.08),transparent_60%)] text-[#f4ede2] font-mono antialiased selection:bg-[#ff5a2e] selection:text-black">
//       {/* We inject one small style block solely for the custom CSS animation keyframe */}
//       <style>{`
//         @keyframes develop {
//           to { opacity: 1; transform: translateY(0); }
//         }
//       `}</style>

//       <div className="max-w-[460px] mx-auto pt-7 px-4 pb-16">
        
//         {/* Masthead */}
//         <div className="text-center mb-6">
//           <span className="inline-block tracking-[0.35em] text-[0.65rem] text-[#ff5a2e] uppercase border border-[#a33d1e] rounded-full px-3.5 py-1.5 mb-3.5">
//             Roll Developed
//           </span>
//           <h1 className="font-serif italic font-normal text-3xl m-0 mb-1.5 tracking-wide">
//             Your Strip
//           </h1>
//           <p className="m-0 text-[#b8ab9a] text-[0.82rem]">
//             Pick a filter before downloading.
//           </p>
//         </div>

//         {/* Filters */}
//         <div className="flex gap-2 justify-center mb-6 flex-wrap">
//           {FILTERS.map((f) => (
//             <button
//               key={f.label}
//               onClick={() => setActiveFilter(f.value)}
//               className={`bg-[#1d1a15] px-3.5 py-1.5 rounded-full cursor-pointer text-xs transition-all duration-200 border 
//                 ${activeFilter === f.value 
//                   ? 'bg-[#ff5a2e] text-[#15130f] border-[#ff5a2e] font-bold' 
//                   : 'text-[#f4ede2] border-[#b8ab9a] hover:border-[#ff5a2e]'}`}
//             >
//               {f.label}
//             </button>
//           ))}
//         </div>

//         {/* Collage Download */}
//         <div className="flex justify-center mb-5">
//           <button 
//             onClick={downloadCollage}
//             className="bg-[#ff5a2e] text-[#15130f] px-6 py-3 rounded-md font-black cursor-pointer uppercase tracking-[0.1em] transition-transform duration-100 active:scale-95 active:bg-[#ff7a52] w-full"
//           >
//             Download Full Strip
//           </button>
//         </div>

//         {/* The Film Strip */}
//         <div className="bg-[#0a0908] rounded-2xl py-1 shadow-[0_20px_45px_rgba(0,0,0,0.55)]">
          
//           <div className="flex justify-between px-3.5 py-1">{sprockets}</div>
          
//           <div className="p-3.5 flex flex-col gap-3.5">
//             {images.map((src, index) => (
//               <figure 
//                 key={index} 
//                 className="m-0 relative bg-[#1d1a15] p-2.5 pb-3.5 rounded-md opacity-0 translate-y-2.5 animate-[develop_0.6s_ease-out_forwards]"
//                 style={{ animationDelay: `${index * 120}ms` }}
//               >
//                 <img 
//                   src={src} 
//                   alt={`Photo ${index + 1}`} 
//                   style={{ filter: activeFilter }} 
//                   crossOrigin="anonymous" 
//                   className="block w-full rounded-sm transition-all duration-300"
//                 />
                
//                 <button 
//                   onClick={() => downloadSingle(src, index)}
//                   className="flex items-center justify-center gap-2 mt-2.5 text-[#15130f] bg-[#ff5a2e] font-bold text-[0.78rem] tracking-[0.12em] uppercase py-2.5 rounded transition-all duration-150 w-full cursor-pointer active:scale-95 active:bg-[#ff7a52]"
//                 >
//                   Save
//                 </button>
//               </figure>
//             ))}
//           </div>

//           <div className="flex justify-between px-3.5 py-1">{sprockets}</div>
//         </div>

//         {/* Hint */}
//         <p className="text-center text-[#b8ab9a] text-[0.75rem] mt-6 leading-relaxed">
//           Photos live on this device's local network only.<br />
//           <strong className="text-[#f4ede2]">This link expires when the booth resets.</strong>
//         </p>
//       </div>
//     </div>
//   );
// }