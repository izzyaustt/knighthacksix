export type Line = { start: number; end: number; text: string };

export type Pair = { src: string; tgt: string; note?: string };

export type AlignedLine = {
  start: number;
  end: number;
  src: string;    // English (source)
  tgt: string;    // Selected learning language (target)
  pairs: Pair[];
};
