declare module 'svg-mesh-3d' {
  export type SvgMeshOptions = {
    delaunay?: boolean;
    clean?: boolean;
    exterior?: boolean;
    randomization?: number;
    simplify?: number;
    scale?: number;
    normalize?: boolean;
  };

  export type SvgMesh = {
    positions: number[][];
    cells: number[][];
  };

  export default function svgMesh3d(svgPath: string, opt?: SvgMeshOptions): SvgMesh;
}
