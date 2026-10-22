import { useCallback, useRef, useState } from "react";
import { GoogleGenAI, Modality, type LiveServerMessage } from "@google/genai";
import { toast } from "sonner";

const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
const OUTPUT_PREBUFFER_SAMPLES = 2400;
const VIDEO_INTERVAL_MS = 500;

type LiveSystemMessageSettings = {
  systemInstruction: string;
  model?: string;
  responseModality?: "AUDIO" | "TEXT";
};

type TranscriptItem = { role: "user" | "agent"; text: string };

function pcm16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function base64ToPCM16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Int16Array(bytes.buffer);
}

export function useGeminiLive(systemMessageSettings: LiveSystemMessageSettings) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [sessionDurationMs, setSessionDurationMs] = useState(0);
  const [consentTranscription, setConsentTranscriptionState] = useState(false);

  const isMutedRef = useRef(false);
  const isVideoEnabledRef = useRef(true);
  const cameraFacingRef = useRef<"user" | "environment">("user");
  const isSessionOpenRef = useRef(false);
  const manualDisconnectRef = useRef(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);

  const inputNodeRef = useRef<AudioWorkletNode | null>(null);
  const outputNodeRef = useRef<AudioWorkletNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const videoIntervalRef = useRef<number | null>(null);

  const pendingOutputRef = useRef<Int16Array[]>([]);
  const pendingOutputSamplesRef = useRef(0);
  const playbackPrimedRef = useRef(false);
  const connectedAtRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<number | null>(null);
  const resumptionHandleRef = useRef<string | null>(null);
  const consentTranscriptionRef = useRef(false);

  const setConsentTranscription = useCallback((value: boolean) => {
    consentTranscriptionRef.current = value;
    setConsentTranscriptionState(value);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      window.clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const syncSessionDuration = useCallback(() => {
    if (!connectedAtRef.current) {
      setSessionDurationMs(0);
      return 0;
    }

    const elapsedMs = Date.now() - connectedAtRef.current;
    setSessionDurationMs(elapsedMs);
    return elapsedMs;
  }, []);

  const beginSessionTracking = useCallback(() => {
    connectedAtRef.current = Date.now();
    setSessionDurationMs(0);
    durationIntervalRef.current = window.setInterval(() => {
      syncSessionDuration();
    }, 1000);
  }, [syncSessionDuration]);

  const endSessionTracking = useCallback(() => {
    stopDurationTimer();
    syncSessionDuration();
    connectedAtRef.current = null;
  }, [stopDurationTimer, syncSessionDuration]);

  const stopVideoCapture = useCallback(() => {
    if (videoIntervalRef.current) {
      window.clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
  }, []);

  const cleanupMedia = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    stopVideoCapture();

    if (inputNodeRef.current) {
      inputNodeRef.current.port.onmessage = null;
      inputNodeRef.current.disconnect();
      inputNodeRef.current = null;
    }

    if (outputNodeRef.current) {
      outputNodeRef.current.disconnect();
      outputNodeRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    if (audioSourceRef.current) {
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }

    if (silentGainRef.current) {
      silentGainRef.current.disconnect();
      silentGainRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setMicVolume(0);
    setIsUserTalking(false);
  }, [stopVideoCapture]);

  const resetPlayback = useCallback(() => {
    pendingOutputRef.current = [];
    pendingOutputSamplesRef.current = 0;
    playbackPrimedRef.current = false;
    setIsAudioPlaying(false);
    outputNodeRef.current?.port.postMessage({ type: "flush" });
  }, []);

  const enqueueOutputPCM = useCallback((pcm: Int16Array) => {
    pendingOutputRef.current.push(pcm);
    pendingOutputSamplesRef.current += pcm.length;

    if (!playbackPrimedRef.current) {
      if (pendingOutputSamplesRef.current < OUTPUT_PREBUFFER_SAMPLES) return;

      playbackPrimedRef.current = true;
      setIsAudioPlaying(true);

      while (pendingOutputRef.current.length) {
        const chunk = pendingOutputRef.current.shift()!;
        pendingOutputSamplesRef.current -= chunk.length;
        outputNodeRef.current?.port.postMessage(
          { type: "chunk", buffer: chunk.buffer },
          [chunk.buffer],
        );
      }

      return;
    }

    setIsAudioPlaying(true);

    const chunk = pendingOutputRef.current.shift();
    if (!chunk) return;

    pendingOutputSamplesRef.current -= chunk.length;
    outputNodeRef.current?.port.postMessage(
      { type: "chunk", buffer: chunk.buffer },
      [chunk.buffer],
    );
  }, []);

  const captureFrame = useCallback(() => {
    if (
      !isVideoEnabledRef.current ||
      !sessionRef.current ||
      !isSessionOpenRef.current ||
      !videoRef.current ||
      !canvasRef.current
    ) {
      return;
    }

    if (videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    if (videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play();
    }

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    const base64Data = canvas.toDataURL("image/jpeg", 0.75).split(",")[1];
    if (!base64Data) return;

    sessionRef.current.sendRealtimeInput({
      video: {
        data: base64Data,
        mimeType: "image/jpeg",
      },
    });
  }, []);

  const startVideoCapture = useCallback(() => {
    stopVideoCapture();

    if (!isVideoEnabledRef.current || !streamRef.current) return;

    captureFrame();
    videoIntervalRef.current = window.setInterval(captureFrame, VIDEO_INTERVAL_MS);
  }, [captureFrame, stopVideoCapture]);

  const initAudio = useCallback(async () => {
    const base = window.location.origin;

    if (!inputCtxRef.current) {
      inputCtxRef.current = new AudioContext({ latencyHint: "interactive" });
      await inputCtxRef.current.audioWorklet.addModule(`${base}/audio-input-worklet.js`);
    }

    if (!outputCtxRef.current) {
      outputCtxRef.current = new AudioContext({
        sampleRate: OUTPUT_RATE,
        latencyHint: "interactive",
      });
      await outputCtxRef.current.audioWorklet.addModule(`${base}/audio-output-worklet.js`);
    }

    if (inputCtxRef.current.state === "suspended") {
      await inputCtxRef.current.resume();
    }

    if (outputCtxRef.current.state === "suspended") {
      await outputCtxRef.current.resume();
    }

    if (!outputNodeRef.current) {
      outputNodeRef.current = new AudioWorkletNode(
        outputCtxRef.current,
        "gemini-output-worklet",
        {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        },
      );

      outputNodeRef.current.port.onmessage = (event: MessageEvent) => {
        if (event.data?.type === "underrun") {
          setIsAudioPlaying(false);
        }
      };

      outputNodeRef.current.connect(outputCtxRef.current.destination);
    }
  }, []);

  const startStreaming = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: {
        facingMode: cameraFacingRef.current,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24, max: 30 },
      },
    });

    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play();
    }

    const inputContext = inputCtxRef.current!;
    const source = inputContext.createMediaStreamSource(stream);
    const analyser = inputContext.createAnalyser();

    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateVolume = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i += 1) {
        sum += dataArray[i];
      }

      const volume = Math.min(1, sum / dataArray.length / 128);

      setMicVolume((previous) => {
        if (volume === 0 && previous === 0) return previous;
        if (Math.abs(previous - volume) < 0.02) return previous;
        return volume;
      });

      setIsUserTalking((previous) => {
        if (previous && volume < 0.1) return false;
        if (!previous && volume >= 0.15) return true;
        return previous;
      });

      rafIdRef.current = requestAnimationFrame(updateVolume);
    };

    updateVolume();

    const inputNode = new AudioWorkletNode(inputContext, "gemini-input-worklet", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      processorOptions: {
        targetSampleRate: INPUT_RATE,
        chunkSamples: 320,
      },
    });

    const silentGain = inputContext.createGain();
    silentGain.gain.value = 0;

    audioSourceRef.current = source;
    inputNodeRef.current = inputNode;
    silentGainRef.current = silentGain;

    source.connect(inputNode);
    inputNode.connect(silentGain);
    silentGain.connect(inputContext.destination);

    inputNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (isMutedRef.current || !sessionRef.current || !isSessionOpenRef.current) {
        return;
      }

      const pcm = new Int16Array(event.data);

      sessionRef.current.sendRealtimeInput({
        audio: {
          data: pcm16ToBase64(pcm),
          mimeType: `audio/pcm;rate=${INPUT_RATE}`,
        },
      });
    };

    startVideoCapture();
  }, [startVideoCapture]);

  const flipCamera = useCallback(async () => {
    if (!streamRef.current) return;

    const nextFacing = cameraFacingRef.current === "user" ? "environment" : "user";
    cameraFacingRef.current = nextFacing;
    setCameraFacing(nextFacing);

    streamRef.current.getVideoTracks().forEach((track) => {
      track.stop();
      streamRef.current?.removeTrack(track);
    });

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: nextFacing,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24, max: 30 },
      },
    });

    const newVideoTrack = newStream.getVideoTracks()[0];
    if (!newVideoTrack) return;

    streamRef.current.addTrack(newVideoTrack);

    if (videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play();
    }

    if (isSessionOpenRef.current && isVideoEnabledRef.current) {
      startVideoCapture();
    }
  }, [startVideoCapture]);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    isSessionOpenRef.current = false;
    resumptionHandleRef.current = null;

    endSessionTracking();
    cleanupMedia();
    resetPlayback();

    const session = sessionRef.current;
    sessionRef.current = null;
    session?.close();

    setIsConnected(false);
    setStatus("idle");
    setTranscript([]);
    setSessionDurationMs(0);
  }, [cleanupMedia, endSessionTracking, resetPlayback]);

  const startConnection = useCallback(
    async (selectedVoice: string) => {
      try {
        setStatus("connecting");
        manualDisconnectRef.current = false;

        await initAudio();
        await startStreaming();

        const tokenResponse = await fetch("/api/session-token", { method: "POST" });
        const { token: ephemeralToken, error: tokenError } = await tokenResponse.json();

        if (!ephemeralToken) {
          throw new Error(tokenError || "Failed to get session token");
        }

        const ai = new GoogleGenAI({
          apiKey: ephemeralToken,
          httpOptions: { apiVersion: "v1alpha" },
        });

        const session = await ai.live.connect({
          model: systemMessageSettings.model || "gemini-3.1-flash-live-preview",
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: systemMessageSettings.systemInstruction,

            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice },
              },
            },

            ...(consentTranscriptionRef.current
              ? {
                  inputAudioTranscription: {},
                  outputAudioTranscription: {},
                }
              : {}),
            contextWindowCompression: { slidingWindow: {} },
            sessionResumption: resumptionHandleRef.current
              ? { handle: resumptionHandleRef.current }
              : {},
          },
          callbacks: {
            onopen: async () => {
              isSessionOpenRef.current = true;
              setIsConnected(true);
              setStatus("live");
              resetPlayback();
              beginSessionTracking();
            },
            onmessage: async (message: LiveServerMessage) => {
              if (message.serverContent?.interrupted) {
                resetPlayback();
              }

              const newHandle = (message as any).sessionResumptionUpdate?.newHandle;
              if (newHandle) {
                resumptionHandleRef.current = newHandle;
              }

              if (consentTranscriptionRef.current) {
                const inputTranscript = message.serverContent?.inputTranscription?.text;
                if (inputTranscript) {
                  setTranscript((previous) => [
                    ...previous,
                    { role: "user", text: inputTranscript },
                  ]);
                }

                const outputTranscript = message.serverContent?.outputTranscription?.text;
                if (outputTranscript) {
                  setTranscript((previous) => [
                    ...previous,
                    { role: "agent", text: outputTranscript },
                  ]);
                }
              }

              const parts = message.serverContent?.modelTurn?.parts ?? [];

              for (const part of parts) {
                if (part.inlineData?.data) {
                  enqueueOutputPCM(base64ToPCM16(part.inlineData.data));
                }

                if (part.text && consentTranscriptionRef.current) {
                  setTranscript((previous) => [
                    ...previous,
                    { role: "agent", text: part.text! },
                  ]);
                }
              }
            },

          
            onclose: () => {
              isSessionOpenRef.current = false;
              resumptionHandleRef.current = null;

              endSessionTracking();
              cleanupMedia();
              resetPlayback();

              sessionRef.current = null;
              setIsConnected(false);
              setStatus("idle");
              setSessionDurationMs(0);

              if (!manualDisconnectRef.current) {
                toast.error("Live session closed unexpectedly");
              }

              manualDisconnectRef.current = false;
            },
            onerror: (error: any) => {
              isSessionOpenRef.current = false;
              resumptionHandleRef.current = null;

              endSessionTracking();
              cleanupMedia();
              resetPlayback();

              sessionRef.current = null;
              setStatus("error");
              setIsConnected(false);
              setSessionDurationMs(0);
              manualDisconnectRef.current = true;

              toast.error(error instanceof Error ? error.message : "Live API error");
            },
          },
        });

        sessionRef.current = session;
      } catch (error) {
        isSessionOpenRef.current = false;

        cleanupMedia();
        resetPlayback();

        sessionRef.current = null;
        setStatus("error");
        setIsConnected(false);
        setSessionDurationMs(0);
        manualDisconnectRef.current = false;

        toast.error(
          error instanceof Error ? error.message : "Failed to start the live session",
        );
      }
    },
    [
      beginSessionTracking,
      cleanupMedia,
      endSessionTracking,
      enqueueOutputPCM,
      initAudio,
      resetPlayback,
      startStreaming,
      systemMessageSettings,
    ],
  );

  const sendText = useCallback((text: string) => {
    if (!sessionRef.current || !isSessionOpenRef.current) return;
    sessionRef.current.sendRealtimeInput({ text });
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((previous) => {
      const next = !previous;
      isMutedRef.current = next;

      if (next && isSessionOpenRef.current && sessionRef.current) {
        sessionRef.current.sendRealtimeInput({ audioStreamEnd: true });
      }

      return next;
    });
  }, []);

  const toggleVideo = useCallback(() => {
    setIsVideoEnabled((previous) => {
      const next = !previous;
      isVideoEnabledRef.current = next;

      streamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = next;
      });

      if (!next) {
        stopVideoCapture();
      } else if (isSessionOpenRef.current) {
        startVideoCapture();
      }

      return next;
    });
  }, [startVideoCapture, stopVideoCapture]);

  return {
    isConnected,
    isMuted,
    cameraFacing,
    isAudioPlaying,
    micVolume,
    isUserTalking,
    transcript,
    status,
    sessionDurationMs,
    videoRef,
    canvasRef,
    startConnection,
    disconnect,
    sendText,
    toggleMute,
    toggleVideo,
    flipCamera,
    isVideoEnabled,
    consentTranscription,
    setConsentTranscription,
  };
}