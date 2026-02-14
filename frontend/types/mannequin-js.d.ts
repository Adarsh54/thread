declare module "mannequin-js/src/mannequin.js" {
  import * as THREE from "three";

  interface Stage {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    light: THREE.DirectionalLight;
    animationLoop: ((t: number) => void) | null;
    ground?: THREE.Mesh;
    controls?: unknown;
  }

  interface Joint {
    bend: number;
    turn: number;
    tilt: number;
    posture: number[];
    recolor(color: string, jointColor?: string): void;
  }

  interface ArmJoint extends Joint {
    raise: number;
    straddle: number;
  }

  interface LegJoint extends Joint {
    raise: number;
    straddle: number;
  }

  interface FingerJoint extends Joint {
    straddle: number;
    mid: Joint;
    tip: Joint;
  }

  interface HeadJoint extends Joint {
    nod: number;
  }

  class Mannequin extends THREE.Group {
    constructor(feminine: boolean, height?: number);
    body: Joint;
    pelvis: Joint;
    torso: Joint;
    neck: Joint;
    head: HeadJoint;
    l_arm: ArmJoint;
    r_arm: ArmJoint;
    l_elbow: Joint;
    r_elbow: Joint;
    l_wrist: Joint;
    r_wrist: Joint;
    l_leg: LegJoint;
    r_leg: LegJoint;
    l_knee: Joint;
    r_knee: Joint;
    l_ankle: Joint;
    r_ankle: Joint;
    l_finger_0: FingerJoint;
    l_finger_1: FingerJoint;
    l_finger_2: FingerJoint;
    l_finger_3: FingerJoint;
    l_finger_4: FingerJoint;
    r_finger_0: FingerJoint;
    r_finger_1: FingerJoint;
    r_finger_2: FingerJoint;
    r_finger_3: FingerJoint;
    r_finger_4: FingerJoint;
    bend: number;
    tilt: number;
    turn: number;
    posture: { version: number; data: number[][] };
    postureString: string;
    feminine: boolean;
    rawHeight: number;
    stepOnGround(): void;
    recolor(
      head?: string,
      shoes?: string,
      pelvis?: string,
      joints?: string,
      limbs?: string,
      torso?: string,
      nails?: string
    ): void;
  }

  class Male extends Mannequin {
    constructor(height?: number);
  }

  class Female extends Mannequin {
    constructor(height?: number);
  }

  class Child extends Mannequin {
    constructor(height?: number);
  }

  function createStage(animateFunction?: (t: number) => void): void;
  function getStage(): Stage;
  function getVersion(): number;
  function getPostureVersion(): number;
  function getGroundLevel(): number;
  function blend(
    posture0: { version: number; data: number[][] },
    posture1: { version: number; data: number[][] },
    k: number
  ): { version: number; data: number[][] };
}
