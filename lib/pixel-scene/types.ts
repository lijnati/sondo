export type PixelPreset = "meadow" | "bloom" | "dusk" | "highland";

export type PixelSceneOptions = {
  preset?: PixelPreset;
  seed?: number;
  pixel?: number;
  sky?: readonly string[];
  sunX?: number;
  sunY?: number;
  sun?: boolean;
  clearCenter?: boolean;
  clouds?: string[];
};

export type PixelSceneHandle = {
  canvas: HTMLCanvasElement;
  rerender: () => void;
  destroy: () => void;
};

export type PixelSceneApi = {
  mount: (el: HTMLElement, opts?: PixelSceneOptions) => PixelSceneHandle;
  render: (canvas: HTMLCanvasElement, opts?: PixelSceneOptions) => void;
  sprite: (
    el: HTMLElement,
    name: "bee" | "butterfly" | "bird",
    opts?: { scale?: number },
  ) => HTMLCanvasElement | null;
  pollen: (canvas: HTMLCanvasElement, opts?: { max?: number; color?: string }) => () => void;
  parallax: (root?: ParentNode) => void;
  presets: string[];
};
