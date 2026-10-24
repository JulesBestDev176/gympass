import { Body, Controller, Get, Header, Param, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingAdminGuard } from '../platform-billing/billing-admin.guard';
import { AppReleasesService } from './app-releases.service';
import { APK_MAX_BYTES } from './apk-metadata';

@Controller('app-releases')
export class AppReleasesController {
  constructor(private readonly releases: AppReleasesService) {}

  @Get('android/latest')
  @Header('Cache-Control', 'no-store')
  latest() { return this.releases.latest(); }

  @Get('android/:id/apk')
  async download(@Param('id') id: string, @Res({ passthrough: true }) response: any) {
    const { row, stream } = await this.releases.download(id);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('ETag', `"${row.sha256}"`);
    return new StreamableFile(stream, { type: 'application/vnd.android.package-archive', disposition: `attachment; filename="gympass-${row.versionCode}.apk"`, length: row.sizeBytes });
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, BillingAdminGuard)
  @Header('Cache-Control', 'private, no-store')
  list(@Query('cursor') cursor?: string, @Query('limit') limit?: string) { return this.releases.list(cursor, limit === undefined ? 20 : Number(limit)); }

  @Post('admin')
  @UseGuards(JwtAuthGuard, BillingAdminGuard)
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(FileInterceptor('apk', {
    storage: diskStorage({ destination: tmpdir(), filename: (_request, _file, callback) => callback(null, `gympass-apk-${randomUUID()}.tmp`) }),
    limits: { fileSize: APK_MAX_BYTES, files: 1, fields: 1, fieldSize: 40000, parts: 2 },
  }))
  create(@UploadedFile() file: Express.Multer.File, @Body('notes') notes: string, @Req() request: any) { return this.releases.createDraft(file, notes ?? '', request.user.id); }

  @Post('admin/:id/publish')
  @UseGuards(JwtAuthGuard, BillingAdminGuard)
  @Header('Cache-Control', 'private, no-store')
  publish(@Param('id') id: string) { return this.releases.publish(id); }
}
