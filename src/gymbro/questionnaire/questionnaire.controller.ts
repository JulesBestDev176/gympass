import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { QuestionnaireService } from './questionnaire.service';
import { GymbroJwtGuard } from '../auth/guards/gymbro-jwt.guard';
import { QuestionnaireStep1Dto } from './dto/step1.dto';
import { QuestionnaireStep2Dto } from './dto/step2.dto';
import { QuestionnaireStep3Dto } from './dto/step3.dto';
import { QuestionnaireStep4Dto } from './dto/step4.dto';
import { QuestionnaireStep5Dto } from './dto/step5.dto';
import { QuestionnaireStep6Dto } from './dto/step6.dto';

@Controller('gymbro/questionnaire')
@UseGuards(GymbroJwtGuard)
export class QuestionnaireController {
  constructor(private readonly service: QuestionnaireService) {}

  @Get()
  getMyProfile(@Req() req: any) {
    return this.service.getMyProfile(req.user.id);
  }

  @Patch('step/:step')
  saveV3Step(@Req() req: any, @Param('step', ParseIntPipe) step: number, @Body() input: unknown) {
    return this.service.saveV3Step(req.user.id, step, input);
  }

  @Post('validate')
  validateV3(@Req() req: any) {
    return this.service.validateV3(req.user.id);
  }

  @Post('step/1')
  step1(@Req() req: any, @Body() dto: QuestionnaireStep1Dto) {
    return this.service.saveStep1(req.user.id, dto);
  }

  @Post('step/2')
  step2(@Req() req: any, @Body() dto: QuestionnaireStep2Dto) {
    return this.service.saveStep2(req.user.id, dto);
  }

  @Post('step/3')
  step3(@Req() req: any, @Body() dto: QuestionnaireStep3Dto) {
    return this.service.saveStep3(req.user.id, dto);
  }

  @Post('step/4')
  step4(@Req() req: any, @Body() dto: QuestionnaireStep4Dto) {
    return this.service.saveStep4(req.user.id, dto);
  }

  @Post('step/5')
  step5(@Req() req: any, @Body() dto: QuestionnaireStep5Dto) {
    return this.service.saveStep5(req.user.id, dto);
  }

  @Post('step/6')
  step6(@Req() req: any, @Body() dto: QuestionnaireStep6Dto) {
    return this.service.saveStep6(req.user.id, dto);
  }

  @Post('submit')
  submit(@Req() req: any) {
    return this.service.submit(req.user.id);
  }

  // Correction d'une réponse déjà donnée (après completion)
  @Patch('update')
  update(@Req() req: any, @Body() data: Record<string, any>) {
    return this.service.updateField(req.user.id, data);
  }
}
