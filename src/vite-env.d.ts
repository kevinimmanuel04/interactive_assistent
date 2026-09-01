/// <reference types="vite/client" />
import type { ThreeElements } from "@react-three/fiber";

declare module "*.css";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements extends ThreeElements {
        group: any;
        primitive: any;
        ambientLight: any;
        directionalLight: any;
        pointLight: any;
      }
    }
  }
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {
      group: any;
      primitive: any;
      ambientLight: any;
      directionalLight: any;
      pointLight: any;
    }
  }
}
