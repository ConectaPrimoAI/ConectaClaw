import { Context } from "telegraf";
import { createRequire } from "module";
import { addLog } from "../web-terminal.js";

const require = createRequire(import.meta.url);
const PptxGenJS = require("pptxgenjs");

interface VisualElement {
  type: "text" | "shape" | "image" | "line";
  x: any;
  y: any;
  w: any;
  h: any;
  content?: string;
  fontSize?: any;
  fontFace?: string;
  color?: string;
  fill?: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  shapeType?: string;
  borderColor?: string;
  borderSize?: number;
  shadow?: { type: "outer" | "inner"; color: string; blur: number; offset: number };
  transparency?: number;
  rotation?: number;
  bullet?: boolean;
  hyperlink?: string;
}

interface DynamicSlide {
  background?: string;
  backgroundGradient?: { type: "linear"; angle: number; colors: { color: string; pos: number }[] };
  elements: VisualElement[];
  transition?: { type: string; duration: number };
}

interface IaraPresentationPayload {
  topic: string;
  template?: 'modern' | 'corporate' | 'creative' | 'dark';
  slides: DynamicSlide[];
}

export class SlidesSkill {
  name = "slides";
  description = "Gerador de apresentações PPTX com suporte a templates e design sofisticado.";

  canHandle(input: string): boolean {
    return input.includes('[SYSTEM_SLIDES:');
  }

  private cleanHex(val: any): string {
    if (!val) return "";
    return String(val).replace(/#/g, "").trim();
  }

  private cleanText(text: any): string {
    if (!text) return "";
    return String(text).replace(/\\n/g, "\n").trim();
  }

  private formatCoord(val: any): any {
    if (val === undefined || val === null) return 1;
    if (typeof val === "string" && val.includes("%")) return val.trim();
    const num = parseFloat(String(val));
    return isNaN(num) ? 1 : num;
  }

  private resolveShapeType(pres: any, shapeType?: string): any {
    const map: Record<string, any> = {
      rect: pres.shapes.RECTANGLE,
      oval: pres.shapes.OVAL,
      rounded_rect: pres.shapes.ROUNDED_RECTANGLE,
    };
    return map[(shapeType || "rect").toLowerCase()] ?? pres.shapes.RECTANGLE;
  }

  private applyTemplate(payload: IaraPresentationPayload): IaraPresentationPayload {
    // Lógica de UI/UX sofisticada: Aplica estilos baseados no template escolhido
    if (!payload.template) return payload;

    const templates: Record<string, Partial<DynamicSlide>> = {
      modern: {
        background: "F8F9FA",
        backgroundGradient: { type: "linear", angle: 45, colors: [{ color: "FFFFFF", pos: 0 }, { color: "E9ECEF", pos: 100 }] }
      },
      dark: {
        background: "212529",
        backgroundGradient: { type: "linear", angle: 180, colors: [{ color: "343A40", pos: 0 }, { color: "212529", pos: 100 }] }
      },
      corporate: {
        background: "FFFFFF",
        elements: [{ type: "line", x: 0, y: "90%", w: "100%", h: 0, color: "004085", borderSize: 5 }] as any
      }
    };

    const style = templates[payload.template];
    if (style) {
      payload.slides = payload.slides.map(slide => ({
        ...style,
        ...slide,
        elements: [...(style.elements || []), ...slide.elements]
      }));
    }
    return payload;
  }

  async execute(params: string, ctx: Context): Promise<any> {
    try {
      const jsonMatch = params.match(/\[SYSTEM_SLIDES:\s*([\s\S]*?)\]/);
      if (!jsonMatch) throw new Error("JSON de slides não encontrado.");

      let designDoc: IaraPresentationPayload = JSON.parse(jsonMatch[1]);
      designDoc = this.applyTemplate(designDoc);

      const pres = new PptxGenJS();
      pres.layout = "LAYOUT_WIDE";

      for (const slideData of designDoc.slides) {
        const slide = pres.addSlide();

        if (slideData.background) {
          const bg = slideData.background;
          if (bg.startsWith("http")) slide.background = { path: bg };
          else slide.background = { color: this.cleanHex(bg) };
        } else if (slideData.backgroundGradient) {
          slide.background = {
            gradient: {
              type: "linear",
              angle: slideData.backgroundGradient.angle,
              colors: slideData.backgroundGradient.colors.map(c => ({ color: this.cleanHex(c.color), pos: c.pos }))
            }
          };
        }

        for (const el of slideData.elements) {
          const x = this.formatCoord(el.x);
          const y = this.formatCoord(el.y);
          const w = this.formatCoord(el.w);
          const h = this.formatCoord(el.h);
          const color = this.cleanHex(el.color || "000000");
          const fill = this.cleanHex(el.fill || "FFFFFF");

          if (el.type === "text") {
            slide.addText(this.cleanText(el.content), {
              x, y, w, h,
              fontSize: el.fontSize || 18,
              color,
              align: el.align || "left",
              bold: !!el.bold,
              bullet: el.bullet ? { type: "bullet" } : undefined
            });
          } else if (el.type === "shape") {
            slide.addShape(this.resolveShapeType(pres, el.shapeType), {
              x, y, w, h,
              fill: { color: fill },
              line: el.borderColor ? { color: this.cleanHex(el.borderColor), pt: el.borderSize || 1 } : undefined
            });
          } else if (el.type === "image" && el.content) {
            slide.addImage({ path: el.content, x, y, w, h });
          } else if (el.type === "line") {
            slide.addShape(pres.shapes.LINE, { x, y, w, h: 0, line: { color, pt: el.borderSize || 2 } });
          }
        }
      }

      const buffer = await pres.write({ outputType: "nodebuffer" });
      await ctx.replyWithDocument({ source: buffer, filename: `apresentacao_${Date.now()}.pptx` });

      return { success: true, text: "Apresentação gerada com sucesso! ✅" };
    } catch (error: any) {
      addLog(`❌ Erro Slides: ${error.message}`);
      return { success: false, text: `Erro ao gerar slides: ${error.message}` };
    }
  }
}
