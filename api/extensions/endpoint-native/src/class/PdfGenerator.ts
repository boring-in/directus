import { Liquid } from 'liquidjs';
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

class PdfGenerator {
    private engine: Liquid;
    private templateDir: string;

    constructor() {
        this.templateDir = path.join(__dirname, '../../extensions/template');
        this.engine = new Liquid({
            root: this.templateDir,
            extname: '.liquid'
        });

        // Create template directory if it doesn't exist
        if (!fs.existsSync(this.templateDir)) {
            fs.mkdirSync(this.templateDir, { recursive: true });
        }
    }

    /**
     * Generate PDF from JSON data using a Liquid template
     * @param templateName Name of the liquid template file (without extension)
     * @param data JSON data to be used in template
     * @returns Buffer containing the generated PDF
     */
    async generatePdf(templateName: string, data: any): Promise<Buffer> {
        try {
            // Render template with data
            const templatePath = path.join(this.templateDir, `${templateName}.liquid`);
            
            // Check if template exists
            if (!fs.existsSync(templatePath)) {
                throw new Error(`Template ${templateName}.liquid not found in ${this.templateDir}`);
            }

            // Render the template with the provided data
            const html = await this.engine.renderFile(templateName, data);

            // Launch Puppeteer and create PDF
            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox']
            });
            const page = await browser.newPage();
            
            // Set content and wait for network idle
            await page.setContent(html, {
                waitUntil: 'networkidle0'
            });

            // Generate PDF
            const pdf = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20px',
                    right: '20px',
                    bottom: '20px',
                    left: '20px'
                }
            });

            await browser.close();
            return pdf as Buffer;

        } catch (error) {
            console.error('Error generating PDF:', error);
            throw error;
        }
    }
}

export default PdfGenerator;
