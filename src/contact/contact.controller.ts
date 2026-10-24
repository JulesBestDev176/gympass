import { Controller, Post, Get, Delete, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { GymDashGuard } from '../auth/guards/gymdash.guard';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateContactDto) {
    return this.contactService.create(dto);
  }

  @UseGuards(GymDashGuard)
  @Get()
  findAll() {
    return this.contactService.findAll();
  }

  @UseGuards(GymDashGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contactService.remove(id);
  }
}
