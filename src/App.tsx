import React, { useState, useEffect, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import { 
    Calendar, 
    FileArchive, 
    Play, 
    Download, 
    Settings, 
    Video, 
    CheckCircle2, 
    AlertCircle, 
    Loader2, 
    Music, 
    Image as ImageIcon, 
    Copy 
} from 'lucide-react';

// Helper functions
const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { 
    ctx.beginPath(); 
    ctx.moveTo(x+r,y); 
    ctx.arcTo(x+w,y,x+w,y+h,r); 
    ctx.arcTo(x+w,y+h,x,y+h,r); 
    ctx.arcTo(x,y+h,x,y,r); 
    ctx.arcTo(x,y,x+w,y,r); 
    ctx.closePath(); 
    ctx.fill(); 
}

const formatDateFull = (s: string) => { 
    const [y,m,d] = s.split('-'); 
    return new Date(parseInt(y), parseInt(m)-1, parseInt(d)).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}); 
}

interface Block {
    id: number;
    title: string;
    type: string;
    audioUrl: string | null;
    imageUrl: string | null;
    audioStatus: 'idle' | 'loading' | 'success' | 'error';
    imageStatus: 'idle' | 'loading' | 'success' | 'error';
}

export default function App() {
    const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [readingType, setReadingType] = useState('evangelho');
    const [language, setLanguage] = useState('pt-BR');
    const [gospelRef, setGospelRef] = useState('');
    const [liturgyName, setLiturgyName] = useState('');
    const [liturgyColor, setLiturgyColor] = useState('');
    
    const [message, setMessage] = useState({ text: '', type: 'info' });

    const requestNotificationPermission = useCallback(async () => {
        if (!("Notification" in window)) return;
        if (Notification.permission === "default") {
            await Notification.requestPermission();
        }
    }, []);

    const sendNotification = useCallback((title: string, body: string) => {
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/3204/3204325.png' });
    }, []);

    useEffect(() => {
        requestNotificationPermission();
    }, [requestNotificationPermission]);

    const [blocks, setBlocks] = useState<Block[]>([
        { id: 0, title: "1. Leitura", type: "leitura", audioUrl: null, imageUrl: null, audioStatus: 'idle', imageStatus: 'idle' },
        { id: 1, title: "2. Reflexão", type: "reflexao", audioUrl: null, imageUrl: null, audioStatus: 'idle', imageStatus: 'idle' },
        { id: 2, title: "3. Aplicação", type: "aplicacao", audioUrl: null, imageUrl: null, audioStatus: 'idle', imageStatus: 'idle' },
        { id: 3, title: "4. Oração", type: "oracao", audioUrl: null, imageUrl: null, audioStatus: 'idle', imageStatus: 'idle' }
    ]);

    const [showStudio, setShowStudio] = useState(false);
    const [titleFontSize, setTitleFontSize] = useState(150);
    const [subtitleFontSize, setSubtitleFontSize] = useState(80);
    const [textYPos, setTextYPos] = useState(150);
    const [waveformWidth, setWaveformWidth] = useState(24);
    const [waveformAmplitude, setWaveformAmplitude] = useState(0.3);
    const [waveformOpacity, setWaveformOpacity] = useState(60);
    const [particlesEnabled, setParticlesEnabled] = useState(true);
    const [motionSpeed, setMotionSpeed] = useState(2);
    const [subtitleSlideEnabled, setSubtitleSlideEnabled] = useState(true);
    const [motionEnabled, setMotionEnabled] = useState(true);

    const [recordingSceneNum, setRecordingSceneNum] = useState(1);
    const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
    const [isRecordingUI, setIsRecordingUI] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const previewWaveData = useRef(new Uint8Array(128));
    const particlesRef = useRef<any[]>([]);
    const previewImage = useRef<HTMLImageElement | null>(null);
    const activeAudioElement = useRef<HTMLAudioElement | null>(null);
    
    const isPreviewing = useRef(false);
    const isRecording = useRef(false);
    const stopRequested = useRef(false);
    const previewAnimId = useRef<number | null>(null);

    const blocksRef = useRef(blocks);
    useEffect(() => { blocksRef.current = blocks; }, [blocks]);

    const stateRef = useRef({
        readingType, titleFontSize, subtitleFontSize, textYPos, date, gospelRef, liturgyName, liturgyColor, waveformOpacity, waveformWidth, waveformAmplitude, motionSpeed, subtitleSlideEnabled, particlesEnabled, motionEnabled
    });
    useEffect(() => {
        stateRef.current = { readingType, titleFontSize, subtitleFontSize, textYPos, date, gospelRef, liturgyName, liturgyColor, waveformOpacity, waveformWidth, waveformAmplitude, motionSpeed, subtitleSlideEnabled, particlesEnabled, motionEnabled };
    }, [readingType, titleFontSize, subtitleFontSize, textYPos, date, gospelRef, liturgyName, liturgyColor, waveformOpacity, waveformWidth, waveformAmplitude, motionSpeed, subtitleSlideEnabled, particlesEnabled, motionEnabled]);

    useEffect(() => {
        const s = JSON.parse(localStorage.getItem('v2_set') || '{}'); 
        if(s.ts) setTitleFontSize(parseInt(s.ts)); 
        if(s.ss) setSubtitleFontSize(parseInt(s.ss)); 
        if(s.yp) setTextYPos(parseInt(s.yp)); 
    }, []);

    useEffect(() => {
        const u = blocks?.[0]?.imageUrl;
        if (u) {
            const i = new Image();
            i.crossOrigin = "anonymous";
            i.onload = () => { previewImage.current = i; };
            i.src = u;
        } else {
            previewImage.current = null;
        }
    }, [blocks?.[0]?.imageUrl]);

    const saveSettings = () => { 
        localStorage.setItem('v2_set', JSON.stringify({ ts: titleFontSize, ss: subtitleFontSize, yp: textYPos })); 
        showMsg("Configurações salvas!", "success"); 
    }

    const showMsg = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
        setMessage({ text, type });
    }

    const fetchLiturgyReference = async (overrideDate?: string) => {
        const targetDate = overrideDate || date;
        if (!targetDate) return showMsg("Data necessária.", "error");
        showMsg("Consultando API litúrgica...", "info");
        try {
            const res = await fetch(`https://liturgia.up.railway.app/${targetDate.split('-').reverse().join('-')}`);
            const data = await res.json();
            let t = readingType==='reading1'?data.primeiraLeitura:readingType==='reading2'?data.segundaLeitura:readingType==='psalm'?data.salmo:data.evangelho;
            if (t && t.referencia) {
                setGospelRef(t.referencia);
                setLiturgyName(data.liturgia || '');
                setLiturgyColor(data.cor || '');
                showMsg("Referência encontrada!", "success");
                setShowStudio(true);
            } else throw new Error("Vazio.");
        } catch (e) { 
            showMsg("Erro ao buscar liturgia.", "error"); 
        }
    }

    const handleAudioUpload = (i: number, f: Blob | File | null) => { 
        if(!f) return; 
        const u = URL.createObjectURL(f); 
        setBlocks(prev => {
            const n = [...prev];
            n[i].audioUrl = u;
            n[i].audioStatus = 'success';
            return n;
        });
    }

    const handleImageUpload = (i: number, f: Blob | File | null) => { 
        if(!f) return; 
        const u = URL.createObjectURL(f); 
        setBlocks(prev => {
            const n = [...prev];
            n[i].imageUrl = u;
            n[i].imageStatus = 'success';
            return n;
        });
    }

    const handleZipUpload = async (file: File | null) => {
        if (!file) return;
        showMsg("Processando arquivo ZIP...", "info");
        try {
            const zip = new JSZip();
            const contents = await zip.loadAsync(file);
            
            // Extract date from filename: DD.MM.AAAA.zip
            const nameMatch = file.name.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
            let extractedDate = "";
            if (nameMatch) {
                const [_, d, m, y] = nameMatch;
                extractedDate = `${y}-${m}-${d}`;
                setDate(extractedDate);
                fetchLiturgyReference(extractedDate);
            }

            const newBlocks = JSON.parse(JSON.stringify(blocks));
            
            for (const [path, zipEntry] of Object.entries(contents.files)) {
                if (zipEntry.dir) continue;
                
                const fileName = path.split('/').pop() || "";
                const numberMatch = fileName.match(/(\d)/);
                if (!numberMatch) continue;
                
                const idx = parseInt(numberMatch[1]) - 1;
                if (idx < 0 || idx > 3) continue;

                const lowerName = fileName.toLowerCase();
                const isAudio = lowerName.match(/\.(mp3|wav|m4a|ogg|aac)$/);
                const isImage = lowerName.match(/\.(jpg|jpeg|png|webp|gif)$/);

                if (isAudio || isImage) {
                    const blob = await zipEntry.async("blob");
                    const url = URL.createObjectURL(blob);
                    if (isAudio) {
                        newBlocks[idx].audioUrl = url;
                        newBlocks[idx].audioStatus = 'success';
                    } else {
                        newBlocks[idx].imageUrl = url;
                        newBlocks[idx].imageStatus = 'success';
                    }
                }
            }
            
            setBlocks(newBlocks);
            showMsg("ZIP processado com sucesso!", "success");
            
            // Auto-start recording if all assets are present
            setTimeout(() => {
                const ready = newBlocks.every((b: any) => b.audioUrl && b.imageUrl);
                if (ready) {
                    startFullVideoRecording();
                } else {
                    showMsg("ZIP carregado, mas faltam arquivos para iniciar gravação automática.", "info");
                }
            }, 1500);
        } catch (e) {
            console.error(e);
            showMsg("Erro ao processar ZIP.", "error");
        }
    }

    const initParticles = (width: number, height: number) => { 
        particlesRef.current = []; 
        for (let i = 0; i < 60; i++) { 
            particlesRef.current.push({ 
                x: Math.random() * width, 
                y: Math.random() * height, 
                vx: (Math.random() - 0.5) * 0.4, 
                vy: -(Math.random() * 0.5 + 0.2), 
                size: Math.random() * 4 + 1, 
                alpha: Math.random() * 0.5 + 0.2, 
                phase: Math.random() * Math.PI * 2 
            }); 
        } 
    }

    const updateAndDrawParticles = (ctx: CanvasRenderingContext2D, width: number, height: number) => { 
        ctx.save(); 
        for (let p of particlesRef.current) { 
            p.x += p.vx; 
            p.y += p.vy; 
            p.phase += 0.05; 
            if (p.y < -10) { 
                p.y = height + 10; 
                p.x = Math.random() * width; 
            } 
            const glow = 0.5 + 0.5 * Math.sin(p.phase); 
            ctx.globalAlpha = p.alpha * (0.8 + 0.2 * glow); 
            ctx.fillStyle = "#fff"; 
            ctx.beginPath(); 
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); 
            ctx.fill(); 
        } 
        ctx.restore(); 
    }

    const drawOverlays = (ctx: CanvasRenderingContext2D, w: number, h: number, wave: Uint8Array, currentIsRecording: boolean, blockIdx: number, titleAlpha: number = 1, subAlpha: number = 1, yOff: number = 0) => {
        const s = stateRef.current;
        let title = "";
        if (blockIdx === 0) {
            title = s.readingType==='reading1'?"1ª LEITURA":s.readingType==='reading2'?"2ª LEITURA":s.readingType==='psalm'?"SALMO":"EVANGELHO";
        } else if (blockIdx === 1) {
            title = "REFLEXÃO";
        } else if (blockIdx === 2) {
            title = "APLICAÇÃO";
        } else if (blockIdx === 3) {
            title = "ORAÇÃO";
        }

        const ts = s.titleFontSize;
        const ss = s.subtitleFontSize;
        const yp = s.textYPos;
        
        // Draw Title
        ctx.save();
        ctx.globalAlpha = titleAlpha;
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = `800 ${ts}px 'Alegreya Sans', sans-serif`;
        const tW = ctx.measureText(title).width + 100, tH = ts * 1.5;
        roundRect(ctx, 540-tW/2, yp, tW, tH, 30); 
        ctx.fillStyle = "white"; 
        ctx.fillText(title, 540, yp + tH/2);
        ctx.restore();

        // Draw Subtitles
        ctx.save();
        ctx.globalAlpha = subAlpha;
        ctx.translate(0, yOff);
        ctx.textAlign = "center"; 
        ctx.textBaseline = "middle";
        
        let nY = yp + tH + 20;
        if (s.date) {
            const dateText = formatDateFull(s.date);
            ctx.font = `600 ${ss}px 'Alegreya Sans', sans-serif`;
            const dW = ctx.measureText(dateText).width + 80, dH = ss * 1.6;
            ctx.fillStyle = "rgba(0, 0, 0, 0.3)"; roundRect(ctx, 540-dW/2, nY, dW, dH, 20);
            ctx.fillStyle = "white"; ctx.fillText(dateText, 540, nY + dH/2);
            nY += dH + 20;
        }

        const refText = s.gospelRef || "Bíblia";
        ctx.font = `600 ${ss}px 'Alegreya Sans', sans-serif`;
        const rW = ctx.measureText(refText).width + 80, rH = ss * 1.6;
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)"; roundRect(ctx, 540-rW/2, nY, rW, rH, 20);
        ctx.fillStyle = "white"; ctx.fillText(refText, 540, nY + rH/2);

        nY += rH + 20;

        if (s.liturgyName) {
            let litText = s.liturgyName;
            // Remove weekday (e.g., "6ª feira da 2ª semana da Quaresma" -> "2ª semana da Quaresma")
            litText = litText.replace(/^(.*feira|[Ss]ábado|[Dd]omingo)\s+(da|do|de)\s+(?=\d)/i, '');
            // Capitalize "Semana"
            litText = litText.replace(/\bsemana\b/g, 'Semana');
            // Capitalize first letter
            litText = litText.charAt(0).toUpperCase() + litText.slice(1);

            const lW = ctx.measureText(litText).width + 80, lH = ss * 1.6;
            ctx.fillStyle = "rgba(0, 0, 0, 0.3)"; roundRect(ctx, 540-lW/2, nY, lW, lH, 20);
            ctx.fillStyle = "white"; ctx.fillText(litText, 540, nY + lH/2);

            if (s.liturgyColor) {
                const normalizedColor = s.liturgyColor.toLowerCase().trim();
                let cssColor = '#ffffff';
                if (normalizedColor.includes('verde')) cssColor = '#22c55e';
                else if (normalizedColor.includes('branco')) cssColor = '#ffffff';
                else if (normalizedColor.includes('roxo')) cssColor = '#a855f7';
                else if (normalizedColor.includes('vermelho')) cssColor = '#ef4444';
                else if (normalizedColor.includes('rosa')) cssColor = '#ec4899';
                else if (normalizedColor.includes('preto')) cssColor = '#1f2937';

                ctx.beginPath();
                ctx.moveTo(540 - lW/2 + 30, nY + lH - 8);
                ctx.lineTo(540 + lW/2 - 30, nY + lH - 8);
                ctx.strokeStyle = cssColor;
                ctx.lineWidth = 6;
                ctx.lineCap = 'round';
                ctx.stroke();
            }
            nY += lH + 20;
        }
        ctx.restore();

        // Draw Waveform (Fixed)
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${s.waveformOpacity/100})`;
        const ww = s.waveformWidth;
        const wa = s.waveformAmplitude;
        for(let i=0; i<ww; i++) {
            const bH = Math.max(15, wave[i] * (currentIsRecording ? wa * 3.0 : 1));
            roundRect(ctx, 540+(i*25)+5, 960-bH/2, 18, bH, 9);
            roundRect(ctx, 540-((i+1)*25)+5, 960-bH/2, 18, bH, 9);
        }
        ctx.restore();
    }

    const startPreviewLoop = useCallback(() => {
        isPreviewing.current = true; 
        initParticles(1080, 1920);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const animate = () => {
            if (!isPreviewing.current) return;
            ctx.fillStyle = "#111"; ctx.fillRect(0,0,1080,1920);
            
            if (previewImage.current) {
                ctx.save();
                const isMotionEnabled = stateRef.current.motionEnabled ?? true;
                if (isMotionEnabled) { 
                    const t = Date.now()/2000; 
                    const s = 1.0 + (Math.sin(t * (stateRef.current.motionSpeed*0.2)) + 1)*0.05; 
                    ctx.translate(540,960); 
                    ctx.scale(s,s); 
                    ctx.translate(-540,-960); 
                }
                const imgAspect = previewImage.current.naturalWidth / previewImage.current.naturalHeight;
                let rW = 1080, rH = 1080/imgAspect;
                if (imgAspect > 1080/1920) { rH = 1920; rW = 1920*imgAspect; }
                ctx.drawImage(previewImage.current, (1080-rW)/2, (1920-rH)/2, rW, rH); 
                ctx.restore();
            }
            
            if (stateRef.current.particlesEnabled) updateAndDrawParticles(ctx, 1080, 1920);
            
            for(let i=0; i<stateRef.current.waveformWidth; i++) {
                previewWaveData.current[i] = (Math.sin(i*0.5 + Date.now()/200)+1)*30+10;
            }
            
            drawOverlays(ctx, 1080, 1920, previewWaveData.current, false, 0, 1, 1, 0); 
            previewAnimId.current = requestAnimationFrame(animate);
        };
        animate();
    }, []);

    const startFullVideoRecording = async () => {
        const currentBlocks = blocksRef.current;
        if (currentBlocks.some(b => !b.audioUrl || !b.imageUrl)) return showMsg("Faltam recursos para gravar.", "error");
        
        isPreviewing.current = false; 
        isRecording.current = true; 
        stopRequested.current = false;
        setIsRecordingUI(true);
        
        const canvas = canvasRef.current; 
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)(); 
        const dest = audioCtx.createMediaStreamDestination();
        const analyser = audioCtx.createAnalyser(); 
        analyser.fftSize = 256; 
        const dataArray = new Uint8Array(128);
        
        const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=h264', videoBitsPerSecond: 3000000 });
        const chunks: BlobPart[] = []; 
        recorder.ondataavailable = e => chunks.push(e.data);
        
        recorder.onstop = () => {
            isRecording.current = false; 
            setIsRecordingUI(false);
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob); 
            setFinalVideoUrl(url);
            showMsg("Gravação Concluída!", "success");
            sendNotification("Vídeo Pronto!", "A gravação da liturgia foi concluída com sucesso.");
            
            startPreviewLoop();
        };

        const assets: { img: HTMLImageElement, audio: string }[] = []; 
        for(let b of currentBlocks) { 
            const img = new Image(); 
            img.crossOrigin = "anonymous"; 
            await new Promise(r => { img.onload = r; img.src = b.imageUrl!; }); 
            assets.push({ img, audio: b.audioUrl! }); 
        }
        
        recorder.start();
        let cIdx = 0;
        let sceneStart = performance.now();
        
        const recordDraw = () => {
            if (!isRecording.current) return; 
            const elapsed = performance.now() - sceneStart;
            ctx.fillStyle = "#000"; ctx.fillRect(0,0,1080,1920);
            ctx.save();
            
            const s = 1.0 + (elapsed/1000 * (stateRef.current.motionSpeed*0.004));
            ctx.translate(540,960); ctx.scale(s,s); ctx.translate(-540,-960);
            
            const curImg = assets[cIdx].img; 
            const a = curImg.naturalWidth/curImg.naturalHeight;
            let rW = 1080, rH = 1080/a; 
            if(a > 1080/1920) { rH = 1920; rW = 1920*a; }
            ctx.drawImage(curImg, (1080-rW)/2, (1920-rH)/2, rW, rH); 
            ctx.restore();
            
            if (stateRef.current.particlesEnabled) updateAndDrawParticles(ctx, 1080, 1920);
            analyser.getByteFrequencyData(dataArray); 
            
            let titleAlpha = 1; let subAlpha = 1; let yOff = 0;
            if (elapsed < 800) {
                titleAlpha = elapsed/800;
                subAlpha = elapsed/800;
            }
            if (stateRef.current.subtitleSlideEnabled && elapsed > 12000) { 
                let p = (elapsed-12000)/1000; 
                subAlpha = Math.max(0, 1-p); 
                yOff = p*80; 
            }
            
            drawOverlays(ctx, 1080, 1920, dataArray, true, cIdx, titleAlpha, subAlpha, yOff);
            
            // Use setTimeout fallback for background recording
            if (document.hidden) {
                setTimeout(recordDraw, 1000 / 30); // Force ~30fps even if hidden
            } else {
                requestAnimationFrame(recordDraw);
            }
        };
        recordDraw();

        for (let i = 0; i < 4; i++) {
            if (stopRequested.current) break; 
            cIdx = i; 
            sceneStart = performance.now();
            setRecordingSceneNum(i + 1);
            
            const audio = new Audio(assets[i].audio); 
            audio.crossOrigin = "anonymous"; 
            activeAudioElement.current = audio;
            
            const src = audioCtx.createMediaElementSource(audio); 
            src.connect(analyser); 
            src.connect(dest);
            
            await audio.play(); 
            await new Promise<void>(r => { 
                audio.onended = () => r(); 
                const ck = setInterval(() => { 
                    if(stopRequested.current) { 
                        audio.pause(); 
                        r(); 
                        clearInterval(ck); 
                    } 
                }, 50); 
            });
            if(!stopRequested.current) await new Promise(r => setTimeout(r, 600));
        }
        recorder.stop(); 
        audioCtx.close();
    }

    const stopRecording = () => { 
        stopRequested.current = true; 
        if(activeAudioElement.current) activeAudioElement.current.pause(); 
        isPreviewing.current = true;
        isRecording.current = false;
        setIsRecordingUI(false);
    }

    const getTikTokDesc = () => {
        const [year, month, day] = date.split('-');
        const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
        const formattedDate = `${parseInt(day)} de ${months[parseInt(month)-1]} de ${year}`;
        
        let evangelist = "";
        const refLower = gospelRef.toLowerCase();
        if (refLower.startsWith('mt')) evangelist = "Mateus";
        else if (refLower.startsWith('mc')) evangelist = "Marcos";
        else if (refLower.startsWith('lc')) evangelist = "Lucas";
        else if (refLower.startsWith('jo')) evangelist = "João";

        let header = "";
        if (readingType === 'evangelho') {
            header = `📖 Proclamação do Evangelho de Jesus Cristo ✠ segundo ${evangelist || 'Cristo'} - ${formattedDate}`;
        } else if (readingType === 'psalm') {
            header = `🎵 Salmo Responsorial - ${formattedDate}`;
        } else {
            header = `📜 Leitura - ${formattedDate}`;
        }

        const color = (liturgyColor || "Branco").toUpperCase();
        
        return `${header}\n\n⛪ SEMANA: ${liturgyName}\n🎨 COR: ${color}\n📍 Ref: ${gospelRef}\n\n#evangelho #deus #jesus #biblia #palavradedeus`;
    }
    
    const copyTikTokDesc = () => {
        navigator.clipboard.writeText(getTikTokDesc());
        showMsg("Descrição copiada!", "success");
    }

    const downloadTikTokDesc = () => {
        const a = document.createElement('a');
        const file = new Blob([getTikTokDesc()], {type: 'text/plain'});
        a.href = URL.createObjectURL(file);
        a.download = `descricao_${date}.txt`;
        a.click();
    }
    
    const uploadVideoToDrive = () => {
        showMsg("Upload para o Drive não implementado no original.", "info");
    }

    const renderStatusBadge = (status: string) => {
        if (status === 'loading') return <span className="status-badge status-loading"><div className="spinner border-2" style={{width:'10px',height:'10px'}}></div></span>;
        if (status === 'success') return <span className="status-badge status-success">✓</span>;
        if (status === 'error') return <span className="status-badge status-error">X</span>;
        return null;
    }

    return (
        <div className="min-h-screen p-2 md:p-8 bg-gray-100 font-sans">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Cabeçalho */}
                <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-extrabold text-indigo-700 tracking-tight">Liturgia Studio</h1>
                            <p className="text-gray-500 text-sm font-semibold">Upload de Áudio e Imagem</p>
                        </div>
                        <div className="w-full md:w-auto bg-gray-50 p-2 rounded-lg border border-gray-100">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">URL Drive</label>
                            <input type="text" id="gas-url-input" defaultValue="https://script.google.com/macros/s/AKfycbzwGeWgvwZJam1NNMGJ-BFS-u3QRQ4Ef8AO4VKsUDAqNIq-2vmzkwmK7ZBkU0foCT81/exec" className="w-full md:w-64 border rounded p-1.5 text-xs text-gray-600 font-mono focus:ring-2 focus:ring-indigo-300 outline-none" />
                        </div>
                    </div>

                    {/* Configuração Principal */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Data</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Tipo de Leitura</label>
                            <select value={readingType} onChange={e => setReadingType(e.target.value)} className="w-full border rounded-lg p-2 text-sm font-bold text-indigo-800 bg-indigo-50 focus:ring-2 focus:ring-indigo-200 outline-none">
                                <option value="evangelho">Evangelho</option>
                                <option value="reading1">1ª Leitura</option>
                                <option value="reading2">2ª Leitura</option>
                                <option value="psalm">Salmo</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Idioma</label>
                            <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none">
                                <option value="pt-BR">Português (BR)</option>
                                <option value="es-US">Espanhol</option>
                            </select>
                        </div>
                        <div className="sm:col-span-2 lg:col-span-3">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Referência Bíblica</label>
                            <div className="flex flex-wrap gap-2">
                                <input type="text" value={gospelRef} onChange={e => setGospelRef(e.target.value)} className="flex-1 border rounded-lg p-2 font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-200 outline-none min-w-[200px]" placeholder="Ex: Lucas 10, 25-37" />
                                <button onClick={() => fetchLiturgyReference()} className="bg-indigo-600 text-white px-6 rounded-lg text-xs font-bold shadow-md hover:bg-indigo-700 active:scale-95 transition flex items-center gap-2 py-2">
                                    <Calendar size={14} /> Buscar Liturgia
                                </button>
                                <label className="bg-emerald-600 text-white px-6 rounded-lg text-xs font-bold shadow-md hover:bg-emerald-700 active:scale-95 transition flex items-center gap-2 py-2 cursor-pointer">
                                    <FileArchive size={14} />
                                    <span>Importar ZIP</span>
                                    <input type="file" className="hidden" accept=".zip" onChange={e => handleZipUpload(e.target.files?.[0] || null)} />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={`text-center min-h-[1.5rem] font-bold text-sm tracking-tight ${message.type === 'error' ? 'text-red-500' : message.type === 'success' ? 'text-emerald-500' : 'text-indigo-400'}`}>
                    {message.text}
                </div>

                <div className="space-y-6">
                    {blocks.map((block, idx) => (
                        <div key={block.id} className="block-card bg-white border border-gray-200 rounded-2xl p-4 md:p-6 shadow-sm">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-black text-indigo-800 uppercase tracking-tight">{block.title}</h3>
                                <div className="flex gap-2">
                                    {renderStatusBadge(block.audioStatus)}
                                    {renderStatusBadge(block.imageStatus)}
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
                                <div className="flex-1 w-full space-y-3">
                                    <div className="flex flex-col gap-2">
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase">Áudio do Bloco</label>
                                        <label className="w-full py-2 bg-indigo-600 text-white font-bold rounded-xl text-[10px] uppercase text-center cursor-pointer hover:bg-indigo-700 flex items-center justify-center shadow-sm transition active:scale-95">
                                            <input type="file" className="hidden" accept="audio/*" onChange={e => handleAudioUpload(idx, e.target.files?.[0] || null)} />
                                            <span>🎙️ Upload Áudio</span>
                                        </label>
                                    </div>
                                    {block.audioUrl && <audio className="w-full h-8" controls src={block.audioUrl}></audio>}
                                    
                                    <div className="flex flex-col gap-2">
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase">Imagem do Bloco (9:16)</label>
                                        <label className="w-full py-2 bg-yellow-500 text-white font-bold rounded-xl text-[10px] uppercase text-center cursor-pointer hover:bg-yellow-600 flex items-center justify-center shadow-sm transition active:scale-95">
                                            <input type="file" className="hidden" accept="image/*" onChange={e => handleImageUpload(idx, e.target.files?.[0] || null)} />
                                            <span>🖼️ Upload Imagem</span>
                                        </label>
                                    </div>
                                </div>
                                <div className="w-24 sm:w-32 shrink-0">
                                    <div className="aspect-[9/16] bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden border border-dashed border-gray-300 relative group">
                                        {!block.imageUrl && <span className="text-[8px] font-bold text-gray-400 text-center px-1">Aguardando Imagem</span>}
                                        {block.imageUrl && <img className="w-full h-full object-cover" src={block.imageUrl} alt="Block" />}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Secção de Estúdio */}
                <section className={`mt-8 pt-8 border-t-2 border-gray-200 ${showStudio ? '' : 'hidden'}`}>
                    <div className="flex justify-between items-center mb-6 text-slate-800">
                        <h2 className="text-2xl font-black">Estúdio de Vídeo</h2>
                        <button onClick={saveSettings} className="bg-gray-200 px-4 py-2 rounded-lg font-bold text-xs hover:bg-gray-300">Salvar Ajustes</button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                        <div className="space-y-4">
                            <p className="text-[10px] font-black uppercase text-indigo-500 border-b pb-1">Tipografia</p>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 mb-1">Título</label>
                                <input type="range" value={titleFontSize} onChange={e => setTitleFontSize(parseInt(e.target.value))} min="50" max="250" className="w-full" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 mb-1">Subtítulo</label>
                                <input type="range" value={subtitleFontSize} onChange={e => setSubtitleFontSize(parseInt(e.target.value))} min="20" max="150" className="w-full" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 mb-1">Posição Y</label>
                                <input type="range" value={textYPos} onChange={e => setTextYPos(parseInt(e.target.value))} min="100" max="1200" className="w-full" />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <p className="text-[10px] font-black uppercase text-indigo-500 border-b pb-1">Visualização Áudio</p>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 mb-1">Barras</label>
                                <input type="range" value={waveformWidth} onChange={e => setWaveformWidth(parseInt(e.target.value))} min="5" max="80" className="w-full" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 mb-1">Amplitude</label>
                                <input type="range" value={waveformAmplitude} onChange={e => setWaveformAmplitude(parseFloat(e.target.value))} min="0.1" max="3.0" step="0.1" className="w-full" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 mb-1">Opacidade</label>
                                <input type="range" value={waveformOpacity} onChange={e => setWaveformOpacity(parseInt(e.target.value))} min="0" max="100" className="w-full" />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <p className="text-[10px] font-black uppercase text-indigo-500 border-b pb-1">Efeitos & Saída</p>
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-gray-500 uppercase">Partículas (Luzes)</label>
                                <input type="checkbox" checked={particlesEnabled} onChange={e => setParticlesEnabled(e.target.checked)} className="w-5 h-5 rounded text-indigo-600" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 mb-1">Velocidade Zoom</label>
                                <input type="range" value={motionSpeed} onChange={e => setMotionSpeed(parseFloat(e.target.value))} min="0" max="10" step="0.5" className="w-full" />
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-gray-500 uppercase">Saída (Slide Down)</label>
                                <input type="checkbox" checked={subtitleSlideEnabled} onChange={e => setSubtitleSlideEnabled(e.target.checked)} className="w-5 h-5 rounded text-indigo-600" />
                            </div>
                        </div>
                    </div>

                    {/* Área de Preview */}
                    <div className="relative max-w-sm mx-auto">
                        {/* Descrição TikTok Antecipada */}
                        {blocks?.[0]?.text && (
                            <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl shadow-sm">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="text-[10px] font-black uppercase text-indigo-400">Descrição TikTok (Prévia)</h4>
                                    <div className="flex gap-2">
                                        <button onClick={copyTikTokDesc} className="bg-white px-3 py-1 rounded-full border border-indigo-200 text-indigo-600 font-bold text-[10px] uppercase hover:bg-indigo-100 transition">Copiar</button>
                                        <button onClick={downloadTikTokDesc} className="bg-white px-3 py-1 rounded-full border border-indigo-200 text-indigo-600 font-bold text-[10px] uppercase hover:bg-indigo-100 transition">Baixar .txt</button>
                                    </div>
                                </div>
                                <textarea readOnly value={getTikTokDesc()} className="w-full h-32 p-3 text-[10px] bg-white/50 border border-indigo-50 rounded-xl font-medium text-gray-600 focus:outline-none leading-relaxed"></textarea>
                            </div>
                        )}

                        {isRecordingUI && (
                            <div className="rec-indicator">
                                <div className="rec-dot"></div> GRAVANDO <span>{recordingSceneNum}</span>/4
                            </div>
                        )}
                        <div className="bg-black rounded-3xl p-1.5 shadow-2xl overflow-hidden ring-4 ring-white">
                            <canvas ref={canvasRef} width={1080} height={1920} className="w-full h-auto block rounded-2xl"></canvas>
                        </div>
                        <div className="mt-6 flex flex-col gap-4">
                            {!isRecordingUI ? (
                                <button onClick={startFullVideoRecording} className="w-full py-5 bg-red-600 text-white font-black rounded-2xl shadow-xl hover:bg-red-700 active:scale-95 transition-all text-xl">
                                    ● GRAVAR VÍDEO COMPLETO
                                </button>
                            ) : (
                                <button onClick={stopRecording} className="w-full py-5 bg-gray-900 text-white font-black rounded-2xl text-xl hover:bg-black transition">
                                    PARAR GRAVAÇÃO
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Resultados */}
                    {finalVideoUrl && (
                        <div className="mt-8 bg-white p-6 rounded-3xl border border-gray-200 shadow-xl">
                            <h3 className="text-xl font-black text-green-700 mb-4 text-center">Vídeo Concluído!</h3>
                            <video controls src={finalVideoUrl} className="max-w-full h-auto mx-auto mb-6 border rounded-2xl bg-black shadow-lg"></video>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <a href={finalVideoUrl} download={`video_${date.replace(/-/g,'.')}.mp4`} className="flex items-center justify-center py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 shadow transition">Baixar MP4</a>
                                <button onClick={uploadVideoToDrive} className="flex items-center justify-center py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow transition">Salvar Drive</button>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
