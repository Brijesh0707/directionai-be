import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';

type PdfRenderOptions = {
  html: string;
};

@Injectable()
export class ReportPdfService {
  async renderLongPagePdf({ html }: PdfRenderOptions): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({
        width: 1600,
        height: 1200,
        deviceScaleFactor: 1,
      });

      await page.setContent(html, {
        waitUntil: ['load', 'domcontentloaded'],
        timeout: 60000,
      });

      await page.emulateMediaType('screen');
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => undefined);

      const dimensions = await page.evaluate(() => {
        const body = document.body;
        const htmlElement = document.documentElement;

        return {
          width: Math.max(
            body.scrollWidth,
            body.offsetWidth,
            htmlElement.clientWidth,
            htmlElement.scrollWidth,
            htmlElement.offsetWidth,
          ),
          height: Math.max(
            body.scrollHeight,
            body.offsetHeight,
            htmlElement.clientHeight,
            htmlElement.scrollHeight,
            htmlElement.offsetHeight,
          ),
        };
      });

      const width = Math.max(dimensions.width, 1200);
      const height = Math.max(dimensions.height + 48, 800);

      return Buffer.from(
        await page.pdf({
          printBackground: true,
          width: `${width}px`,
          height: `${height}px`,
          margin: {
            top: '0',
            right: '0',
            bottom: '0',
            left: '0',
          },
          preferCSSPageSize: false,
        }),
      );
    } finally {
      await browser.close();
    }
  }
}
