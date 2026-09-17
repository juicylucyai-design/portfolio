import { Body, Controller, Get, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import type { DocumentInfo, SessionUser } from '@nksq/contracts';
import { CurrentUser } from '../../common/public.decorator';
import { parseId } from '../../common/validation';
import { DocumentsService } from './documents.service';

@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /** Body is the raw PDF (Content-Type: application/pdf); no multipart parsing involved. */
  @Post('documents')
  upload(
    @Body() body: unknown,
    @Query('fileName') fileName: string | undefined,
    @Query('category') category: string | undefined,
    @CurrentUser() user: SessionUser,
  ): Promise<DocumentInfo> {
    return this.documents.uploadPdf(body, fileName, category, user);
  }

  @Get('documents/:id')
  get(@Param('id') id: string): Promise<DocumentInfo> {
    return this.documents.get(parseId(id, 'Document id'));
  }

  @Get('documents/:id/file')
  async file(
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { document, content } = await this.documents.getFile(parseId(id, 'Document id'));
    const disposition = download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', document.contentType);
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(document.fileName)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(content);
  }

  @Get('investments/:id/documents')
  listForInvestment(@Param('id') id: string): Promise<DocumentInfo[]> {
    return this.documents.listForInvestment(parseId(id, 'Investment id'));
  }
}
