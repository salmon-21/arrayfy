import * as Colors from './Colors';
import * as Encoder from './Encoder';
import * as Images from './Images';

export interface PlaneConfig {
  planeType: Encoder.PlaneType;
  id: string;
  matchIndex: number;
  matchInvert: boolean;
}

function makeDirectPlane(id: string = 'color'): PlaneConfig {
  return {
    planeType: Encoder.PlaneType.DIRECT,
    id: id,
    matchIndex: -1,
    matchInvert: false,
  };
}

function makeIndexMatch(
    index: number, id: string, invert: boolean = false): PlaneConfig {
  return {
    planeType: Encoder.PlaneType.INDEX_MATCH,
    id: id,
    matchIndex: index,
    matchInvert: invert,
  };
}


export interface Config {
  label: string;
  description: string;
  format: Images.PixelFormat;
  channelOrder: Images.ChannelOrder;
  farPixelFirst: boolean;
  bigEndian: boolean;
  packUnit: Encoder.PackUnit;
  vertPack: boolean;
  alignBoundary: Encoder.AlignBoundary;
  alignLeft: boolean;
  vertAddr: boolean;
  palette: Uint32Array;
  planeCfgs: PlaneConfig[];
}

export const defaultConfig: Config = {
  label: 'default',
  description: 'default',
  format: Images.PixelFormat.RGBA8888,
  channelOrder: Images.ChannelOrder.ARGB,
  farPixelFirst: false,
  bigEndian: false,
  packUnit: Encoder.PackUnit.PIXEL,
  vertPack: false,
  alignBoundary: Encoder.AlignBoundary.BYTE_1,
  alignLeft: false,
  vertAddr: false,
  palette: new Uint32Array(),
  planeCfgs: [makeDirectPlane()],
};

const argb8888_le = (function(): Config {
  let p = {...defaultConfig};
  p.label = 'ARGB8888-LE';
  p.description = '透明度付きフルカラー。';
  p.format = Images.PixelFormat.RGBA8888;
  p.channelOrder = Images.ChannelOrder.ARGB;
  return p;
})();

const rgb888_be = (function(): Config {
  let p = {...defaultConfig};
  p.label = 'RGB888-BE';
  p.description = 'フルカラー。24bit 液晶用。';
  p.format = Images.PixelFormat.RGB888;
  p.channelOrder = Images.ChannelOrder.ARGB;
  p.bigEndian = true;
  return p;
})();

const rgb666_be_ra = (function(): Config {
  let p = {...defaultConfig};
  p.label = 'RGB666-BE-RA';
  p.description =
      '各バイトにチャネルを下位詰めで配置した RGB666。LovyanGFX 用。';
  p.format = Images.PixelFormat.RGB666;
  p.channelOrder = Images.ChannelOrder.ARGB;
  p.packUnit = Encoder.PackUnit.UNPACKED;
  p.bigEndian = true;
  return p;
})();

const rgb666_be_la = (function(): Config {
  let p = {...defaultConfig};
  p.label = 'RGB666-BE-LA';
  p.description =
      '各バイトにチャネルを上位詰めで配置した RGB666。低レベル API の 18bit モード用。';
  p.format = Images.PixelFormat.RGB666;
  p.channelOrder = Images.ChannelOrder.ARGB;
  p.packUnit = Encoder.PackUnit.UNPACKED;
  p.alignLeft = true;
  p.bigEndian = true;
  return p;
})();

const rgb565_be = (function(): Config {
  let p = {...defaultConfig};
  p.label = 'RGB565-BE';
  p.description =
      'ハイカラー。\n各種 GFX ライブラリでの使用を含め、\n組み込み用途で一般的な形式。';
  p.format = Images.PixelFormat.RGB565;
  p.channelOrder = Images.ChannelOrder.ARGB;
  p.bigEndian = true;
  return p;
})();

const rgb444_be = (function(): Config {
  let p = {...defaultConfig};
  p.label = 'RGB444-BE';
  p.description = 'ST7789 の 12bit モード用の形式。';
  p.format = Images.PixelFormat.RGB444;
  p.packUnit = Encoder.PackUnit.ALIGNMENT;
  p.farPixelFirst = true;
  p.bigEndian = true;
  p.alignBoundary = Encoder.AlignBoundary.BYTE_3;
  return p;
})();

const argb4444_le = (function(): Config {
  let p = {...defaultConfig};
  p.label = 'ARGB4444-LE';
  p.description = 'アルファチャンネル付きの RGB444 形式。';
  p.format = Images.PixelFormat.RGBA4444;
  p.packUnit = Encoder.PackUnit.ALIGNMENT;
  p.bigEndian = false;
  p.channelOrder = Images.ChannelOrder.ARGB;
  p.alignBoundary = Encoder.AlignBoundary.BYTE_2;
  return p;
})();

const rgb332 = (function(): Config {
  let p = {...defaultConfig};
  p.label = 'RGB332';
  p.description = '各種 GFX ライブラリ用。';
  p.format = Images.PixelFormat.RGB332;
  return p;
})();

const rgb111_ra = (function(): Config {
  let p = {...defaultConfig};
  p.label = 'RGB111';
  p.description = 'ILI9488 の 8 色モード用。';
  p.format = Images.PixelFormat.RGB111;
  p.packUnit = Encoder.PackUnit.ALIGNMENT;
  p.farPixelFirst = true;
  return p;
})();

const bw_hscan = (function(): Config {
  let p = {...defaultConfig};
  p.label = '白黒 横スキャン';
  p.description = '各種 GFX ライブラリ用。';
  p.format = Images.PixelFormat.BW;
  p.packUnit = Encoder.PackUnit.ALIGNMENT;
  p.farPixelFirst = true;
  return p;
})();

const bw_vpack = (function(): Config {
  let p = {...defaultConfig};
  p.label = '白黒 縦パッキング';
  p.description =
      'SPI/I2C ドライバを使用して\nSSD1306/1309 等の白黒ディスプレイに直接転送するための形式。';
  p.format = Images.PixelFormat.BW;
  p.packUnit = Encoder.PackUnit.ALIGNMENT;
  p.vertPack = true;
  return p;
})();

const epd_kwr = (function(): Config {
  let p = {...defaultConfig};
  p.label = '黒白赤 (2plane)';
  p.description = '3色電子ペーパー向けの形式。';
  p.format = Images.PixelFormat.I2_RGB888;
  p.packUnit = Encoder.PackUnit.ALIGNMENT;
  p.farPixelFirst = true;
  p.palette = new Uint32Array([
    Colors.strToU32('#000'),
    Colors.strToU32('#FFF'),
    Colors.strToU32('#C00'),
  ]);
  p.planeCfgs = [
    makeIndexMatch(1, 'white'),
    makeIndexMatch(2, 'red'),
  ];
  return p;
})();

const epd_kwry = (function(): Config {
  let p = {...defaultConfig};
  p.label = '黒白赤黄 (2bpp)';
  p.description = '4色電子ペーパー向けの形式。';
  p.format = Images.PixelFormat.I2_RGB888;
  p.packUnit = Encoder.PackUnit.ALIGNMENT;
  p.farPixelFirst = true;
  p.palette = new Uint32Array([
    Colors.strToU32('#000'),
    Colors.strToU32('#FFF'),
    Colors.strToU32('#FF0'),
    Colors.strToU32('#C00'),
  ]);
  p.planeCfgs = [
    makeDirectPlane('index'),
  ];
  return p;
})();

const epd_kwyrbg = (function(): Config {
  let p = {...defaultConfig};
  p.label = 'ePaper 6色 (仮)';
  p.description = '6色電子ペーパー向けの形式。';
  p.format = Images.PixelFormat.I4_RGB888;
  p.packUnit = Encoder.PackUnit.ALIGNMENT;
  p.farPixelFirst = true;
  p.palette = new Uint32Array([
    Colors.strToU32('#000'),
    Colors.strToU32('#FFF'),
    Colors.strToU32('#fdc811'),
    Colors.strToU32('#d33711'),
    Colors.strToU32('#33426f'),
    Colors.strToU32('#407113'),
  ]);
  p.planeCfgs = [
    makeDirectPlane('index'),
  ];
  return p;
})();

const epd_kwgbryo = (function(): Config {
  let p = {...defaultConfig};
  p.label = 'ePaper 7色 (仮)';
  p.description =
      '7色電子ペーパー E Ink Gallery Palette(TM) 4000 ePaper 向けの形式。';
  p.format = Images.PixelFormat.I4_RGB888;
  p.packUnit = Encoder.PackUnit.ALIGNMENT;
  p.farPixelFirst = true;
  p.palette = new Uint32Array([
    Colors.strToU32('#000'),
    Colors.strToU32('#FFF'),
    Colors.strToU32('#407113'),
    Colors.strToU32('#33426f'),
    Colors.strToU32('#d33711'),
    Colors.strToU32('#fdc811'),
    Colors.strToU32('#f46211'),
  ]);
  p.planeCfgs = [
    makeDirectPlane('index'),
  ];
  return p;
})();

const nes = (function(): Config {
  let p = {...defaultConfig};
  p.label = 'NESパレット';
  p.description = 'ファミコンのパレット(テスト用)。';
  p.format = Images.PixelFormat.I6_RGB888;
  p.packUnit = Encoder.PackUnit.ALIGNMENT;
  p.farPixelFirst = true;
  p.palette = new Uint32Array([
    Colors.strToU32('#ab0013'), Colors.strToU32('#e7005b'),
    Colors.strToU32('#ff77b7'), Colors.strToU32('#ffc7db'),
    Colors.strToU32('#a70000'), Colors.strToU32('#db2b00'),
    Colors.strToU32('#ff7763'), Colors.strToU32('#ffbfb3'),
    Colors.strToU32('#7f0b00'), Colors.strToU32('#cb4f0f'),
    Colors.strToU32('#ff9b3b'), Colors.strToU32('#ffdbab'),
    Colors.strToU32('#432f00'), Colors.strToU32('#8b7300'),
    Colors.strToU32('#f3bf3f'), Colors.strToU32('#ffe7a3'),
    Colors.strToU32('#004700'), Colors.strToU32('#009700'),
    Colors.strToU32('#83d313'), Colors.strToU32('#e3ffa3'),
    Colors.strToU32('#005100'), Colors.strToU32('#00ab00'),
    Colors.strToU32('#4fdf4B'), Colors.strToU32('#abf3bf'),
    Colors.strToU32('#003f17'), Colors.strToU32('#00933b'),
    Colors.strToU32('#58f898'), Colors.strToU32('#b3ffcf'),
    Colors.strToU32('#1b3f5f'), Colors.strToU32('#00838b'),
    Colors.strToU32('#00ebdb'), Colors.strToU32('#9FFFF3'),
    Colors.strToU32('#271b8f'), Colors.strToU32('#0073ef'),
    Colors.strToU32('#3fbfff'), Colors.strToU32('#abe7ff'),
    Colors.strToU32('#0000ab'), Colors.strToU32('#233bef'),
    Colors.strToU32('#5f73ff'), Colors.strToU32('#c7d7ff'),
    Colors.strToU32('#47009f'), Colors.strToU32('#8300f3'),
    Colors.strToU32('#a78Bfd'), Colors.strToU32('#d7cbff'),
    Colors.strToU32('#8f0077'), Colors.strToU32('#bf00bf'),
    Colors.strToU32('#f77Bff'), Colors.strToU32('#ffc7ff'),
    Colors.strToU32('#000000'), Colors.strToU32('#757575'),
    Colors.strToU32('#bcbcbc'), Colors.strToU32('#ffffff'),
  ]);
  p.planeCfgs = [
    makeDirectPlane('index'),
  ];
  return p;
})();


export const presets: Record<string, Config> = {
  argb8888_le,
  rgb888_be,
  rgb666_be_ra,
  rgb666_be_la,
  rgb565_be,
  argb4444_le,
  rgb444_be,
  rgb332,
  rgb111_ra,
  bw_hscan,
  bw_vpack,
  epd_kwr,
  epd_kwry,
  epd_kwyrbg,
  epd_kwgbryo,
  nes,
};
