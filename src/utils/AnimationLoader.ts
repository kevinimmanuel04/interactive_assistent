import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from "@pixiv/three-vrm-animation";

/**
 * Pure Native VRMA Animation Loader.
 * Loads .vrma files, strips baked-in eye closing keyframes, and returns a standard Three.js AnimationClip.
 */
export async function loadAnimation(url: string, vrm: VRM): Promise<THREE.AnimationClip | null> {
  try {
    const gltfLoader = new GLTFLoader();
    gltfLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    const gltf = await gltfLoader.loadAsync(url);

    const vrmAnimations = gltf.userData.vrmAnimations;
    const vrmAnimation = (vrmAnimations && vrmAnimations[0]) || gltf.userData.vrmAnimation;

    if (vrmAnimation) {
      const clip = createVRMAnimationClip(vrmAnimation, vrm);

      // Strip baked-in eye closing tracks from animation clips so eyes stay wide open & sparkling!
      if (clip && clip.tracks) {
        clip.tracks = clip.tracks.filter((track) => {
          const name = track.name.toLowerCase();
          if (
            name.includes("blink") ||
            name.includes("relaxed") ||
            name.includes("eye_close") ||
            name.includes("eyeblink") ||
            name.includes("closeeye")
          ) {
            return false;
          }
          return true;
        });
      }

      return clip;
    }
  } catch (err) {
    console.warn(`[AnimationLoader] Error loading VRMA animation from ${url}:`, err);
  }
  return null;
}
