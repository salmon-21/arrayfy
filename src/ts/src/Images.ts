import {Point} from './Geometries';
import {Vec3} from './Math3D';
import {Palette} from './Palettes';
import {clip} from './Utils';
import {XorShift32} from './XorShifts';

export const enum ColorSpace {
  GRAYSCALE,
  RGB,
}

export const enum PixelFormat {
  RGBA8888,
  RGB888,
  RGB666,
  RGB565,
  // RGB555,
  RGBA4444,
  RGB444,
  RGB332,
  RGB111,
  GRAY4,
  GRAY2,
  BW,
  I2_RGB888,
  I4_RGB888,
  I6_RGB888,
}

export const enum ChannelOrder {
  RGBA,
  BGRA,
  ARGB,
  ABGR,
}

export class PixelFormatInfo {
  public colorSpace: ColorSpace;
  public colorBits: number[];
  public alphaBits = 0;
  public indexBits = 0;

  constructor(public id: PixelFormat) {
    switch (id) {
      case PixelFormat.RGBA8888:
        this.colorSpace = ColorSpace.RGB;
        this.colorBits = [8, 8, 8];
        this.alphaBits = 8;
        break;
      case PixelFormat.RGBA4444:
        this.colorSpace = ColorSpace.RGB;
        this.colorBits = [4, 4, 4];
        this.alphaBits = 4;
        break;
      case PixelFormat.RGB888:
        this.colorSpace = ColorSpace.RGB;
        this.colorBits = [8, 8, 8];
        break;
      case PixelFormat.RGB666:
        this.colorSpace = ColorSpace.RGB;
        this.colorBits = [6, 6, 6];
        break;
      case PixelFormat.RGB565:
        this.colorSpace = ColorSpace.RGB;
        this.colorBits = [5, 6, 5];
        break;
      // case PixelFormat.RGB555:
      //   this.colorSpace = ColorSpace.RGB;
      //   this.colorBits = [5, 5, 5];
      //   break;
      case PixelFormat.RGB444:
        this.colorSpace = ColorSpace.RGB;
        this.colorBits = [4, 4, 4];
        break;
      case PixelFormat.RGB332:
        this.colorSpace = ColorSpace.RGB;
        this.colorBits = [3, 3, 2];
        break;
      case PixelFormat.RGB111:
        this.colorSpace = ColorSpace.RGB;
        this.colorBits = [1, 1, 1];
        break;
      case PixelFormat.GRAY4:
        this.colorSpace = ColorSpace.GRAYSCALE;
        this.colorBits = [4];
        break;
      case PixelFormat.GRAY2:
        this.colorSpace = ColorSpace.GRAYSCALE;
        this.colorBits = [2];
        break;
      case PixelFormat.BW:
        this.colorSpace = ColorSpace.GRAYSCALE;
        this.colorBits = [1];
        break;
      case PixelFormat.I2_RGB888:
        this.colorSpace = ColorSpace.RGB;
        this.colorBits = [8, 8, 8];
        this.indexBits = 2;
        break;
      case PixelFormat.I4_RGB888:
        this.colorSpace = ColorSpace.RGB;
        this.colorBits = [8, 8, 8];
        this.indexBits = 4;
        break;
      case PixelFormat.I6_RGB888:
        this.colorSpace = ColorSpace.RGB;
        this.colorBits = [8, 8, 8];
        this.indexBits = 6;
        break;
      default:
        throw new Error('Unknown image format');
    }
  }

  toString(): string {
    if (this.isIndexed) {
      return 'Indexed' + this.indexBits;
    } else {
      switch (this.colorSpace) {
        case ColorSpace.GRAYSCALE:
          if (this.colorBits[0] == 1) {
            return 'B/W';
          } else {
            return 'Gray' + this.colorBits[0];
          }
        case ColorSpace.RGB:
          if (this.hasAlpha) {
            return 'RGBA' + this.colorBits.join('') + this.alphaBits.toString();
          } else {
            return 'RGB' + this.colorBits.join('');
          }
        default:
          throw new Error('Unknown color space');
      }
    }
  }

  get hasAlpha(): boolean {
    return this.alphaBits > 0;
  }

  get isIndexed(): boolean {
    return this.indexBits > 0;
  }

  get numTotalChannels(): number {
    return this.colorBits.length + (this.hasAlpha ? 1 : 0);
  }

  get numColorChannels(): number {
    return this.colorBits.length;
  }

  channelName(i: number): string {
    switch (this.colorSpace) {
      case ColorSpace.GRAYSCALE:
        return 'V';
      case ColorSpace.RGB:
        return 'RGBA'.slice(i, i + 1);
      default:
        throw new Error('Unknown color space');
    }
  }
}

export class PixelInfo {
  public color = new Vec3();
  public pos: Point = {x: 0, y: 0};
  public tag: number = 0;

  public clone(): PixelInfo {
    const p = new PixelInfo();
    p.color.copyFrom(this.color);
    p.pos.x = this.pos.x;
    p.pos.y = this.pos.y;
    p.tag = this.tag;
    return p;
  }
}

export class CharacteristicPixelDetector {
  private keyColors = [
    new Vec3(0, 0, 0),
    new Vec3(0.5, 0.5, 0.5),
    new Vec3(1, 1, 1),
    new Vec3(0, 0, 1),
    new Vec3(0, 1, 0),
    new Vec3(0, 1, 1),
    new Vec3(1, 0, 0),
    new Vec3(1, 0, 1),
    new Vec3(1, 1, 0),
  ];

  private bestPixels = new Array<PixelInfo>(this.keyColors.length);

  constructor() {
    this.bestPixels.fill(new PixelInfo());
  }

  public clear(): void {
    for (let i = 0; i < this.bestPixels.length; i++) {
      this.bestPixels[i].tag = 9999;
    }
  }

  public addPixel(col: Vec3, pos: Point): void {
    for (let i = 0; i < this.keyColors.length; i++) {
      const d = col.dist(this.keyColors[i]);
      if (d < this.bestPixels[i].tag) {
        this.bestPixels[i].tag = d;
        this.bestPixels[i].color.copyFrom(col);
        this.bestPixels[i].pos.x = pos.x;
        this.bestPixels[i].pos.y = pos.y;
      }
    }
  }

  public collect(map: Map<number, PixelInfo>): void {
    for (let i = 0; i < this.bestPixels.length; i++) {
      const pix = this.bestPixels[i];
      if (pix.tag > 10) continue;
      const r = clip(0, 255, Math.round(pix.color.x * 255));
      const g = clip(0, 255, Math.round(pix.color.y * 255));
      const b = clip(0, 255, Math.round(pix.color.z * 255));
      const key = (b << 16) | (g << 8) | r;
      if (!map.has(key)) {
        map.set(key, pix.clone());
      }
    }
  }
}

export class NormalizedImage {
  public color: Float32Array;
  public alpha: Float32Array;
  public numColorChannels: number;

  constructor(
      public width: number, public height: number,
      public colorSpace: ColorSpace) {
    switch (colorSpace) {
      case ColorSpace.GRAYSCALE:
        this.numColorChannels = 1;
        break;
      case ColorSpace.RGB:
        this.numColorChannels = 3;
        break;
      default:
        throw new Error('Invalid color space');
    }
    this.color = new Float32Array(width * height * this.numColorChannels);
    this.alpha = new Float32Array(width * height);
  }

  public clone(): NormalizedImage {
    const img = new NormalizedImage(this.width, this.height, this.colorSpace);
    img.color.set(this.color);
    img.alpha.set(this.alpha);
    return img;
  }

  // パレット作成用に色の代表値を収集する
  public collectCharacteristicColors(numEdgeCells: number): PixelInfo[] {
    const ccd = new CharacteristicPixelDetector();

    const map = new Map<number, PixelInfo>();
    const cols = Math.min(this.width, numEdgeCells);
    const rows = Math.min(this.height, numEdgeCells);
    const numCh = this.numColorChannels;
    const rgb = new Vec3();
    for (let iRow = 0; iRow < rows; iRow++) {
      const yStart = Math.floor(this.height * iRow / rows);
      const yEnd = Math.floor(this.height * (iRow + 1) / rows);
      for (let iCol = 0; iCol < cols; iCol++) {
        const xStart = Math.floor(this.width * iCol / cols);
        const xEnd = Math.floor(this.width * (iCol + 1) / cols);

        ccd.clear();

        for (let y = yStart; y < yEnd; y++) {
          for (let x = xStart; x < xEnd; x++) {
            const idx = (y * this.width + x) * numCh;
            switch (numCh) {
              case 1:
                rgb.set(this.color[idx], this.color[idx], this.color[idx]);
                break;
              case 3: {
                rgb.set(
                    this.color[idx], this.color[idx + 1], this.color[idx + 2]);
                break;
              }
              default:
                throw new Error('Invalid number of channels');
            }
            ccd.addPixel(rgb, {x, y});
          }  // for x
        }  // for y

        ccd.collect(map);
      }  // for iCol
    }  // for iRow
    return Array.from(map.values());
  }

  public getAverageColor(): Vec3 {
    const avg = new Array<number>(this.numColorChannels).fill(0);
    let numPixels = 0;
    for (let i = 0; i < this.width * this.height; i++) {
      if (this.alpha[i] == 0) continue;
      for (let ch = 0; ch < this.numColorChannels; ch++) {
        avg[ch] += this.color[i * this.numColorChannels + ch];
      }
      numPixels++;
    }
    const ret = new Vec3();
    ret.x = avg[0] / numPixels;
    ret.y = avg[1] / numPixels;
    ret.z = avg[2] / numPixels;
    return ret;
  }
}

export class ReducedImage {
  public data: Uint8Array[];
  public tmp: Uint8Array;

  constructor(
      public width: number, public height: number,
      public format: PixelFormatInfo, public palette: Palette) {
    const numPixels = width * height;
    const numAllCh = format.numTotalChannels;
    this.data = [];
    for (let i = 0; i < numAllCh; i++) {
      this.data.push(new Uint8Array(numPixels));
    }
    this.tmp = new Uint8Array(format.numTotalChannels);
  }

  getPreviewImage(dest: Uint8Array): void {
    const numAllCh = this.format.numTotalChannels;
    const numColCh = this.format.numColorChannels;
    const alpOutMax =
        this.format.hasAlpha ? (1 << this.format.alphaBits) - 1 : 1;
    for (let i = 0; i < this.width * this.height; i++) {
      // 色の復元
      for (let ch = 0; ch < numAllCh; ch++) {
        this.tmp[ch] = this.data[ch][i];
      }
      this.palette.extract(this.tmp, 0, dest, i * 4);

      // アルファ値の復元
      if (this.format.hasAlpha) {
        dest[i * 4 + 3] = Math.round(this.tmp[numColCh] * 255 / alpOutMax);
      } else {
        dest[i * 4 + 3] = 255;
      }
    }
  }
}
