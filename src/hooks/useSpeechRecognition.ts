import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface UseSpeechRecognitionOptions {
  onAutoSubmit?: (transcript: string) => void;
  lang?: string;
}

export function useSpeechRecognition({
  onAutoSubmit,
  lang = "en-US",
}: UseSpeechRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef<string>("");

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore already stopped errors
      }
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    const SpeechConstructor =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechConstructor) {
      setError("Speech recognition is not supported in this browser environment.");
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        /* ignore */
      }
    }

    setError(null);
    setTranscript("");
    setInterimTranscript("");
    finalTranscriptRef.current = "";

    const instance = new SpeechConstructor();
    instance.continuous = false;
    instance.interimResults = true;
    instance.lang = lang;

    instance.onstart = () => {
      setIsListening(true);
    };

    instance.onresult = (event: SpeechRecognitionEvent) => {
      let final = "";
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        finalTranscriptRef.current += (finalTranscriptRef.current ? " " : "") + final;
        setTranscript(finalTranscriptRef.current);
        if (onAutoSubmit) {
          onAutoSubmit(finalTranscriptRef.current);
          finalTranscriptRef.current = "";
        }
      }
      setInterimTranscript(interim);
    };

    instance.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "no-speech") {
        setError(`Speech recognition error: ${event.error}`);
      }
      setIsListening(false);
    };

    instance.onend = () => {
      setIsListening(false);
      const fullText = (
        finalTranscriptRef.current || interimTranscript
      ).trim();

      if (fullText && onAutoSubmit) {
        onAutoSubmit(fullText);
        finalTranscriptRef.current = "";
      }
      setInterimTranscript("");
    };

    recognitionRef.current = instance;
    try {
      instance.start();
    } catch (e) {
      setError(`Failed to start speech recognition: ${String(e)}`);
      setIsListening(false);
    }
  }, [lang, onAutoSubmit]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    toggleListening,
  };
}
