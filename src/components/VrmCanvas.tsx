import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { convertFileSrc } from "@tauri-apps/api/core";
import { lipSync } from "../lipsync";
import { avatarState, type AvatarState } from "../avatarState";
import { loadAnimation } from "../utils/AnimationLoader";

interface Props {
  modelUrl: string;
  width: number;
  height: number;
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
  isRotateMode?: boolean;
}

export type AnimClipName =
  | "OrcIdle"
  | "Greeting"
  | "Goodbye"
  | "Thinking"
  | "TalkingVrma"
  | "Talking1Vrma"
  | "Idle1"
  | "Idle2"
  | "Clapping"
  | "Jump"
  | "Blush"
  | "Peace sign"
  | "Model pose"
  | "Show full body"
  | "Shoot"
  | "Spin"
  | "Surprised"
  | "LookAround"
  | "Sleepy"
  | "Angry"
  | "Sad"
  | "Relax"
  | "LookingAroundAfterRotation";

const ANIMATION_ASSETS: Array<{ name: AnimClipName; path: string }> = [
  { name: "OrcIdle", path: "/assets/VRMA/Orc Idle.vrma" },
  { name: "Idle1", path: "/assets/VRMA/Idle 1.vrma" },
  { name: "Idle2", path: "/assets/VRMA/Idle 2.vrma" },
  { name: "TalkingVrma", path: "/assets/VRMA/Talking.vrma" },
  { name: "Talking1Vrma", path: "/assets/VRMA/Talking 1.vrma" },
  { name: "Thinking", path: "/assets/VRMA/Thinking.vrma" },
  { name: "Greeting", path: "/assets/VRMA/Greeting.vrma" },
  { name: "Goodbye", path: "/assets/VRMA/Goodbye.vrma" },
  { name: "Clapping", path: "/assets/VRMA/Clapping.vrma" },
  { name: "Jump", path: "/assets/VRMA/Jump.vrma" },
  { name: "Blush", path: "/assets/VRMA/Blush.vrma" },
  { name: "Peace sign", path: "/assets/VRMA/Peace sign.vrma" },
  { name: "Model pose", path: "/assets/VRMA/Model pose.vrma" },
  { name: "Show full body", path: "/assets/VRMA/Show full body.vrma" },
  { name: "Shoot", path: "/assets/VRMA/Shoot.vrma" },
  { name: "Spin", path: "/assets/VRMA/Spin.vrma" },
  { name: "Surprised", path: "/assets/VRMA/Surprised.vrma" },
  { name: "LookAround", path: "/assets/VRMA/LookAround.vrma" },
  { name: "Sleepy", path: "/assets/VRMA/Sleepy.vrma" },
  { name: "Angry", path: "/assets/VRMA/Angry.vrma" },
  { name: "Sad", path: "/assets/VRMA/Sad.vrma" },
  { name: "Relax", path: "/assets/VRMA/Relax.vrma" },
  { name: "LookingAroundAfterRotation", path: "/assets/VRMA/Looking Around after rotation.vrma" },
];

const IDLE_VARIATION_POOL: AnimClipName[] = ["Idle1", "Idle2", "Relax", "LookAround", "Thinking"];

const DOUBLE_CLICK_REACTIONS: AnimClipName[] = [
  "Peace sign",
  "Blush",
  "Spin",
  "Shoot",
  "Model pose",
  "Show full body",
  "Jump",
  "LookAround",
  "Greeting",
  "Goodbye",
  "Clapping",
];

export default function VrmCanvas({
  modelUrl,
  width,
  height,
  zoom = 1,
  offsetX = 0,
  offsetY = 0,
  isRotateMode = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clickAnimTriggerRef = useRef<{ name: AnimClipName; time: number }>({ name: "Peace sign", time: 0 });
  const lastDoubleClickAnimRef = useRef<AnimClipName | null>(null);
  const postRotateAnimRef = useRef<number>(0);
  const modelRotationYRef = useRef<number>(Math.PI);
  const targetRotationYRef = useRef<number>(Math.PI);
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const smoothHeadYawRef = useRef<number>(0);
  const smoothHeadPitchRef = useRef<number>(0);
  const lastInteractionTimeRef = useRef<number>(Date.now());
  const lastSpeechTimeRef = useRef<number>(0);
  const reactionPriorityEndTimeRef = useRef<number>(0);
  const speechAlternateRef = useRef<boolean>(false);
  const idleVarIndexRef = useRef<number>(0);
  const clipsRef = useRef<Partial<Record<AnimClipName, THREE.AnimationClip>>>({});

  // Global Pointer Listener for Smooth Head & Eye Mouse Tracking
  useEffect(() => {
    const handlePointerMoveGlobal = (e: PointerEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      mousePosRef.current = { x, y };
    };

    window.addEventListener("pointermove", handlePointerMoveGlobal);
    return () => {
      window.removeEventListener("pointermove", handlePointerMoveGlobal);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animId: number;
    let currentVrm: VRM | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    const actions: Partial<Record<AnimClipName, THREE.AnimationAction>> = {};
    let currentAnimState: AnimClipName | "Rest" = "OrcIdle";
    let active = true;

    // 1) Three.js Scene, Camera, Renderer
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 50.0);
    camera.position.set(0, 1.1, 2.2);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Studio Lighting
    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    light.position.set(1.0, 2.0, 1.5).normalize();
    scene.add(light);

    const rimLight = new THREE.DirectionalLight(0xa5c9ff, 1.0);
    rimLight.position.set(-1.5, 1.5, -1.0).normalize();
    scene.add(rimLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
    scene.add(ambientLight);

    // Facial Expression Controller (Enforces wide-open sparkling eyes across all gestures)
    const applyFacialExpressions = (vrm: VRM, state: AnimClipName | "Rest") => {
      if (!vrm.expressionManager) return;

      vrm.expressionManager.setValue("happy", 0);
      vrm.expressionManager.setValue("relaxed", 0);
      vrm.expressionManager.setValue("surprised", 0);
      vrm.expressionManager.setValue("angry", 0);
      vrm.expressionManager.setValue("sad", 0);
      vrm.expressionManager.setValue("blink", 0);
      vrm.expressionManager.setValue("blinkLeft", 0);
      vrm.expressionManager.setValue("blinkRight", 0);

      switch (state) {
        case "Greeting":
        case "Goodbye":
          vrm.expressionManager.setValue("happy", 0.95);
          vrm.expressionManager.setValue("relaxed", 0);
          break;
        case "Clapping":
        case "Jump":
          vrm.expressionManager.setValue("happy", 0.9);
          vrm.expressionManager.setValue("surprised", 0.1);
          break;
        case "Blush":
        case "Peace sign":
        case "Model pose":
        case "Show full body":
        case "Spin":
        case "Shoot":
          vrm.expressionManager.setValue("happy", 0.95);
          vrm.expressionManager.setValue("relaxed", 0);
          break;
        case "Thinking":
        case "TalkingVrma":
        case "Talking1Vrma":
          vrm.expressionManager.setValue("happy", 0.45);
          vrm.expressionManager.setValue("relaxed", 0);
          break;
        case "Surprised":
          vrm.expressionManager.setValue("surprised", 0.95);
          break;
        case "Sleepy":
          vrm.expressionManager.setValue("blink", 0.85);
          break;
        case "Angry":
          vrm.expressionManager.setValue("angry", 0.9);
          break;
        case "Sad":
          vrm.expressionManager.setValue("sad", 0.9);
          break;
        case "OrcIdle":
        case "LookAround":
        case "LookingAroundAfterRotation":
        case "Relax":
        case "Idle1":
        case "Idle2":
        case "Rest":
        default:
          vrm.expressionManager.setValue("happy", 0.35);
          vrm.expressionManager.setValue("relaxed", 0);
          break;
      }
    };

    // State Machine Switcher
    const playAnimation = (state: AnimClipName | "Rest", crossfadeDuration = 0.4, loopOnce = true) => {
      if (currentAnimState === state) return;

      const targetClipName = state === "Rest" ? "OrcIdle" : state;
      const nextAction = actions[targetClipName];
      if (!nextAction) return;

      if (currentAnimState !== "Rest" && actions[currentAnimState]) {
        actions[currentAnimState]?.fadeOut(crossfadeDuration);
      }

      nextAction.reset();
      nextAction.setLoop(loopOnce ? THREE.LoopOnce : THREE.LoopRepeat, loopOnce ? 1 : Infinity);
      if (loopOnce) nextAction.clampWhenFinished = true;

      nextAction.fadeIn(crossfadeDuration).play();
      currentAnimState = targetClipName;

      if (currentVrm) {
        applyFacialExpressions(currentVrm, targetClipName);
      }
      console.log(`[AnimationEngine] Switched state -> ${targetClipName} (loopOnce=${loopOnce})`);
    };

    // Native VRMA Motion Loader
    const loadAllAnimations = async (vrm: VRM) => {
      mixer = new THREE.AnimationMixer(vrm.scene);

      mixer.addEventListener("finished", () => {
        console.log(`[AnimationEngine] Motion finished. Returning to OrcIdle default state.`);
        playAnimation("OrcIdle", 0.5, false);
      });

      for (const item of ANIMATION_ASSETS) {
        try {
          const fetchUrl = window.location.origin + item.path;
          const clip = await loadAnimation(fetchUrl, vrm);
          if (!active || !mixer) return;

          if (clip) {
            clipsRef.current[item.name] = clip;
            actions[item.name] = mixer.clipAction(clip);
            console.log(`[AnimationEngine] Loaded motion asset: ${item.name} (${clip.duration.toFixed(2)}s)`);
          }
        } catch (err) {
          console.warn(`[AnimationEngine] Error loading ${item.name}:`, err);
        }
      }

      // Default: Orc Idle plays continuously on loop by default
      if (actions["OrcIdle"]) {
        actions["OrcIdle"].setLoop(THREE.LoopRepeat, Infinity).play();
        currentAnimState = "OrcIdle";
      }
      applyFacialExpressions(vrm, "OrcIdle");
    };

    // 2) Model Loader
    const loadVrm = async () => {
      let resolvedUrl = modelUrl;

      if (!modelUrl.startsWith("http") && !modelUrl.startsWith("blob:") && !modelUrl.startsWith("data:")) {
        try {
          if (modelUrl.startsWith("/")) {
            resolvedUrl = window.location.origin + encodeURI(modelUrl);
          } else {
            resolvedUrl = convertFileSrc(modelUrl);
          }
        } catch {
          resolvedUrl = modelUrl;
        }
      }

      try {
        const response = await fetch(resolvedUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();

        if (!active) return;

        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));

        loader.parse(
          arrayBuffer,
          "",
          async (gltf) => {
            if (!active) return;
            const vrm = gltf.userData.vrm as VRM;
            if (!vrm) return;

            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            VRMUtils.combineSkeletons(gltf.scene);

            const bbox = new THREE.Box3().setFromObject(vrm.scene);
            const size = bbox.getSize(new THREE.Vector3());

            let headY = size.y * 0.85;
            if (vrm.humanoid) {
              const headNode = vrm.humanoid.getNormalizedBoneNode("head");
              if (headNode) {
                const headWorldPos = new THREE.Vector3();
                headNode.getWorldPosition(headWorldPos);
                headY = headWorldPos.y;
              }
            }

            vrm.scene.position.set(offsetX / 100, offsetY / 100, 0);
            vrm.scene.rotation.y = modelRotationYRef.current;
            scene.add(vrm.scene);

            const targetY = headY - 0.42;
            const cameraDist = Math.max(1.7, size.y * 0.95) / Math.max(0.2, zoom);

            camera.position.set(0, targetY, cameraDist);
            camera.lookAt(0, targetY, 0);

            currentVrm = vrm;

            await loadAllAnimations(vrm);
            console.log(`[VRM] April 3D Avatar system ready with 360 Head/Eye Cursor Tracking & Open Eyes!`);
          },
          (error) => {
            console.error("[VRM] Parse error:", error);
          }
        );
      } catch (err) {
        console.error(`[VRM] Fetch failed for ${resolvedUrl}:`, err);
      }
    };

    void loadVrm();

    // 3) Connect Lip-Sync & AvatarState Listeners
    let mouthLevel = 0;
    const unsubLipSync = lipSync.subscribe((level) => {
      mouthLevel = level;
      if (level > 0.05) {
        lastSpeechTimeRef.current = Date.now();
      }
    });

    let currentAvatarState: AvatarState = avatarState.current;
    let lastHandledPrompt = "";

    const unsubAvatarState = avatarState.subscribe((st) => {
      currentAvatarState = st;

      if (st.userPrompt && st.userPrompt !== lastHandledPrompt) {
        lastHandledPrompt = st.userPrompt;
        const lower = st.userPrompt.toLowerCase();
        const silentSec = (Date.now() - lastInteractionTimeRef.current) / 1000;
        lastInteractionTimeRef.current = Date.now();

        // 1. Surprise Trigger
        if (silentSec > 45) {
          console.log(`[Surprise] Silence > ${silentSec.toFixed(1)}s -> Trigger Surprised!`);
          reactionPriorityEndTimeRef.current = Date.now() + 3000;
          playAnimation("Surprised", 0.3, true);
          return;
        }

        // 2. Greeting Trigger ("hi", "hello", "hey")
        if (/\b(hi|hello|hey|greetings|good morning|good evening|good afternoon)\b/i.test(lower)) {
          console.log("[Trigger] Greeting -> Play Greeting!");
          reactionPriorityEndTimeRef.current = Date.now() + 3000;
          playAnimation("Greeting", 0.3, true);
          return;
        }

        // 3. Farewell Trigger ("bye", "goodbye")
        if (/\b(bye|goodbye|see you|farewell|good night)\b/i.test(lower)) {
          console.log("[Trigger] Farewell -> Play Goodbye!");
          reactionPriorityEndTimeRef.current = Date.now() + 3000;
          playAnimation("Goodbye", 0.3, true);
          return;
        }

        // 4. Praise Trigger ("good job", "awesome", "thank you", "thanks")
        if (/\b(good job|awesome|thank you|thanks|well done|great|nice|cool|proud)\b/i.test(lower)) {
          console.log("[Trigger] Praise -> Play Clapping!");
          reactionPriorityEndTimeRef.current = Date.now() + 3000;
          playAnimation("Clapping", 0.3, true);
          return;
        }

        // 5. Scolding Trigger ("shut up", "bad", "stupid", "idiot")
        if (/\b(shut up|bad|stupid|idiot|hate|ugly|useless|dumb|fool|annoying)\b/i.test(lower)) {
          console.log("[Trigger] Scolding -> Play Sad!");
          reactionPriorityEndTimeRef.current = Date.now() + 3000;
          playAnimation("Sad", 0.3, true);
          return;
        }
      }
    });

    // 4) Render Loop with 360 Head/Eye Cursor Tracking & Absolute Open Eyes Enforcement
    const clock = new THREE.Clock();
    let blinkTimer = 0;
    let nextBlinkInterval = 3.5;
    let idleVariationTimer = 0;

    const animate = () => {
      const delta = clock.getDelta();

      if (mixer) {
        mixer.update(delta);
      }

      if (currentVrm) {
        // --- 60fps Target Lerp Body Rotation & Hair Sway Physics ---
        const rotDiff = targetRotationYRef.current - modelRotationYRef.current;
        modelRotationYRef.current += rotDiff * 0.25;
        currentVrm.scene.rotation.y = modelRotationYRef.current;

        // Dynamic Hair Sway Physics while rotating!
        if (currentVrm.humanoid && Math.abs(rotDiff) > 0.001) {
          const headNode = currentVrm.humanoid.getNormalizedBoneNode("head");
          const neckNode = currentVrm.humanoid.getNormalizedBoneNode("neck");
          // Sway tilt opposite to rotation velocity creates hair momentum/inertia
          const swayTilt = Math.min(Math.max(-rotDiff * 0.45, -0.35), 0.35);
          if (headNode) {
            headNode.rotation.z += swayTilt;
            headNode.rotation.y -= rotDiff * 0.25;
          }
          if (neckNode) {
            neckNode.rotation.z += swayTilt * 0.5;
          }
        }

        // --- FULL 360° Mouse Cursor Head Tracking (Top, Bottom, Left, Right!) ---
        if (currentVrm.humanoid) {
          const headNode = currentVrm.humanoid.getNormalizedBoneNode("head");
          const neckNode = currentVrm.humanoid.getNormalizedBoneNode("neck");

          const mx = mousePosRef.current.x; // -1 (left) to +1 (right)
          const my = mousePosRef.current.y; // -1 (bottom) to +1 (top)

          // Top/Bottom (Pitch) and Left/Right (Yaw) natural rotation targets
          const targetYaw = mx * 0.55; // Left / Right (-31° to +31°)
          const targetPitch = my * 0.40; // Top / Bottom (+23° to -23°)

          smoothHeadYawRef.current += (targetYaw - smoothHeadYawRef.current) * 0.15;
          smoothHeadPitchRef.current += (targetPitch - smoothHeadPitchRef.current) * 0.15;

          if (headNode) {
            headNode.rotation.y += smoothHeadYawRef.current * 0.65;
            headNode.rotation.x += smoothHeadPitchRef.current * 0.65; // UP & DOWN Pitch!
          }
          if (neckNode) {
            neckNode.rotation.y += smoothHeadYawRef.current * 0.35;
            neckNode.rotation.x += smoothHeadPitchRef.current * 0.35; // UP & DOWN Pitch!
          }
        }

        // --- VRM LookAt 3D Eye Gaze Tracking (Follow Cursor in 3D Space) ---
        if (currentVrm.lookAt) {
          const lookAtTargetPos = new THREE.Vector3(
            mousePosRef.current.x * 3.0,
            1.1 + mousePosRef.current.y * 2.5, // 3D Y Axis Top/Bottom Eye Gaze!
            2.0
          );
          currentVrm.lookAt.lookAt(lookAtTargetPos);
        }

        // Check post-rotation settling animation
        const postRotateElapsed = (Date.now() - postRotateAnimRef.current) / 1000;
        const isPostRotateActive = postRotateElapsed < 3.2;

        // Check priority reaction timer
        const isPriorityReactionActive = Date.now() < reactionPriorityEndTimeRef.current;
        const doubleClickActive = Date.now() - clickAnimTriggerRef.current.time < 2800;

        if (doubleClickActive) {
          playAnimation(clickAnimTriggerRef.current.name, 0.2, true);
        } else if (isPostRotateActive) {
          // Play "LookingAroundAfterRotation" animation after model rotation finishes!
          playAnimation("LookingAroundAfterRotation", 0.35, true);
        } else if (isPriorityReactionActive) {
          // Priority reaction (e.g. Greeting for "hi") is active!
        } else if (currentAvatarState.mode === "thinking") {
          // AI Thinking state -> Play Thinking.vrma while loading LLM response!
          playAnimation("Thinking", 0.4, false);
        } else if (mouthLevel > 0.05 && !isPostRotateActive) {
          // Speech Audio Active -> Trigger speech animation smoothly while speaking!
          lastSpeechTimeRef.current = Date.now();
          if (currentAnimState !== "TalkingVrma" && currentAnimState !== "Talking1Vrma") {
            const nextSpeech = speechAlternateRef.current ? "Talking1Vrma" : "TalkingVrma";
            speechAlternateRef.current = !speechAlternateRef.current;
            console.log(`[Speech] Triggering speech motion -> ${nextSpeech}`);
            playAnimation(nextSpeech, 0.3, false);
          }
        } else if (
          mouthLevel <= 0.05 &&
          Date.now() - lastSpeechTimeRef.current > 400 &&
          (currentAvatarState.mode as string) !== "thinking" &&
          (currentAnimState === "TalkingVrma" ||
            currentAnimState === "Talking1Vrma" ||
            currentAnimState === "Thinking")
        ) {
          // Speech finished (400ms silence) -> Immediately return back to OrcIdle default state!
          console.log("[Speech] Speech finished -> Cleanly return to OrcIdle default state!");
          playAnimation("OrcIdle", 0.4, false);
        } else if (currentAnimState === "OrcIdle" || currentAnimState === "Rest") {
          // Continuous OrcIdle with systematic rotation through ALL idle variations every 45s
          idleVariationTimer += delta;
          if (idleVariationTimer > 45) {
            idleVariationTimer = 0;
            const idleVar = IDLE_VARIATION_POOL[idleVarIndexRef.current];
            idleVarIndexRef.current = (idleVarIndexRef.current + 1) % IDLE_VARIATION_POOL.length;
            console.log(`[Idle Pool] Playing idle variation #${idleVarIndexRef.current} -> ${idleVar}`);
            playAnimation(idleVar, 0.6, true);
          }

          // Check if inactive for > 2 minutes (120 seconds)
          const inactiveSec = (Date.now() - lastInteractionTimeRef.current) / 1000;
          if (inactiveSec > 120) {
            const inactiveAnim: AnimClipName = Math.random() > 0.5 ? "Sleepy" : "Angry";
            console.log(`[Inactivity] Silent for ${inactiveSec.toFixed(0)}s -> Trigger ${inactiveAnim}!`);
            lastInteractionTimeRef.current = Date.now();
            playAnimation(inactiveAnim, 0.5, true);
          }
        }

        // --- ABSOLUTE ENFORCEMENT: Keep Eyes Wide Open & Sparkling Every Frame ---
        if (currentVrm.expressionManager && currentAnimState !== "Sleepy") {
          currentVrm.expressionManager.setValue("blink", 0);
          currentVrm.expressionManager.setValue("blinkLeft", 0);
          currentVrm.expressionManager.setValue("blinkRight", 0);
          currentVrm.expressionManager.setValue("relaxed", 0);
          currentVrm.expressionManager.setValue("happy", 0.35);
        }

        // Fast, dynamic procedural eye blinking (0.15s - 0.20s duration)
        blinkTimer += delta;
        if (blinkTimer > nextBlinkInterval) {
          const blinkProgress = Math.sin((blinkTimer - nextBlinkInterval) * Math.PI * 5);
          if (currentVrm.expressionManager && currentAnimState !== "Sleepy") {
            currentVrm.expressionManager.setValue("blink", Math.max(0, blinkProgress));
          }
          if (blinkTimer > nextBlinkInterval + 0.2) {
            blinkTimer = 0;
            nextBlinkInterval = 2.5 + Math.random() * 3.0;
          }
        }

        // Real-time lip-sync to ElevenLabs speech
        if (currentVrm.expressionManager) {
          currentVrm.expressionManager.setValue("aa", Math.min(1.0, mouthLevel * 1.8));
          currentVrm.expressionManager.setValue("ih", Math.min(0.6, mouthLevel * 0.9));
          currentVrm.expressionManager.setValue("oh", Math.min(0.4, mouthLevel * 0.6));
        }

        currentVrm.update(delta);
      }

      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      active = false;
      cancelAnimationFrame(animId);
      unsubLipSync();
      unsubAvatarState();
      if (mixer) {
        mixer.stopAllAction();
      }
      if (currentVrm) {
        VRMUtils.deepDispose(currentVrm.scene);
      }
      renderer.dispose();
      container.innerHTML = "";
    };
  }, [modelUrl, width, height, zoom, offsetX, offsetY]);

  // Pointer drag handler for 3D rotation mode with Rotation Velocity & Hair Sway Physics
  const [dragging, setDragging] = useState(false);
  const lastXRef = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isRotateMode) return;
    setDragging(true);
    lastXRef.current = e.clientX;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Fallback
    }
    e.stopPropagation();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isRotateMode || !dragging) return;
    const dx = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;
    targetRotationYRef.current += dx * 0.012;
    e.stopPropagation();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isRotateMode || !dragging) return;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Fallback
    }
    postRotateAnimRef.current = Date.now();
    e.stopPropagation();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const available = DOUBLE_CLICK_REACTIONS.filter((name) => name !== lastDoubleClickAnimRef.current);
    const chosen = available[Math.floor(Math.random() * available.length)];
    lastDoubleClickAnimRef.current = chosen;
    console.log(`[VRM] Double click reaction: ${chosen}!`);
    clickAnimTriggerRef.current = { name: chosen, time: Date.now() };
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      style={{
        width,
        height,
        overflow: "hidden",
        cursor: isRotateMode ? (dragging ? "grabbing" : "grab") : "pointer",
        userSelect: "none",
      }}
    />
  );
}
