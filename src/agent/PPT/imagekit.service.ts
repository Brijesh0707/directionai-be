
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ImageKitGenerateOptions {
  prompt: string;
  width?: number;
  height?: number;
  negativePrompt?: string;
}

export interface ImageKitGeneratedImage {
  url: string;
  thumbnailUrl: string;
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number;
  };
}

@Injectable()
export class ImageKitService {
  private readonly logger = new Logger(ImageKitService.name);

  private readonly publicKey?: string;
  private readonly privateKey?: string;
  private readonly urlEndpoint?: string;

  constructor(private readonly configService: ConfigService) {
    this.publicKey = this.configService.get<string>(
      'IMAGEKIT_PUBLIC_KEY',
    );

    this.privateKey = this.configService.get<string>(
      'IMAGEKIT_PRIVATE_KEY',
    );

    this.urlEndpoint = this.configService.get<string>(
      'IMAGEKIT_URL_ENDPOINT',
    );

    this.logger.log(
      `[ImageKit] Initialized - Configured: ${this.isConfigured()}`,
    );

    if (this.isConfigured()) {
      this.logger.log(
        `[ImageKit] URL Endpoint: ${this.urlEndpoint}`,
      );
    } else {
      this.logger.warn(
        '[ImageKit] Missing IMAGEKIT_URL_ENDPOINT env',
      );
    }
  }

  /**
   * Build AI generated image URL using ImageKit AI transformation
   *
   * Example output:
   * https://ik.imagekit.io/your_id/ik-genimg-prompt-modern-ui-design/image.jpg
   */
  async generateImage(
    options: ImageKitGenerateOptions,
  ): Promise<ImageKitGeneratedImage | null> {
    try {
      if (!this.urlEndpoint) {
        this.logger.warn(
          '[ImageKit] IMAGEKIT_URL_ENDPOINT not configured',
        );

        return null;
      }

      const cleanedPrompt = this.cleanPrompt(
        options.prompt,
      );

      const encodedPrompt = encodeURIComponent(
        cleanedPrompt,
      );

      /**
       * Official ImageKit AI generation URL pattern
       */
      const imageUrl =
        `${this.urlEndpoint}` +
        `/ik-genimg-prompt-${encodedPrompt}/image.jpg`;

      this.logger.log(
        `[ImageKit] Generated AI URL for prompt: "${cleanedPrompt.substring(
          0,
          50,
        )}..."`,
      );

      return {
        url: imageUrl,
        thumbnailUrl: imageUrl,
        metadata: {
          width: options.width ?? 1280,
          height: options.height ?? 720,
          format: 'jpg',
          size: 0,
        },
      };
    } catch (error) {
      this.logger.error(
        `[ImageKit] Failed to generate image URL: ${
          error instanceof Error
            ? error.message
            : 'unknown error'
        }`,
      );

      return null;
    }
  }

  /**
   * Returns direct AI image URL
   */
  async buildImageUrlFromPrompt(
    prompt: string,
  ): Promise<string | null> {
    const result = await this.generateImage({
      prompt,
    });

    if (!result) {
      this.logger.warn(
        `[ImageKit] Returning null URL for prompt: "${prompt.substring(
          0,
          50,
        )}..."`,
      );
    }

    return result?.url ?? null;
  }

  /**
   * Clean prompt for URL safety
   */
  private cleanPrompt(prompt: string): string {
    return prompt
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\-.,]/g, '')
      .trim();
  }

  /**
   * Check configuration
   */
  isConfigured(): boolean {
    return !!this.urlEndpoint;
  }
}
