import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirementStatus } from '@prisma/client';

import { Public } from '../shared/auth/roles.decorator';
import {
  CreateRequirementDto,
  RequirementResponse,
  UpdateRequirementDto,
} from './dto/requirement.dto';
import { RequirementsService } from './requirements.service';

/** Every route is @Public() until ops auth lands — see RequirementsModule. */
@ApiTags('requirements')
@Controller('requirements')
@Public()
export class RequirementsController {
  constructor(private readonly requirements: RequirementsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a shift requirement' })
  @ApiOkResponse({ type: RequirementResponse })
  async create(@Body() dto: CreateRequirementDto): Promise<RequirementResponse> {
    return this.requirements.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List shift requirements' })
  @ApiOkResponse({ type: [RequirementResponse] })
  async findAll(
    @Query('status') status?: RequirementStatus,
    @Query('companyId') companyId?: string,
  ): Promise<RequirementResponse[]> {
    return this.requirements.findAll({ status, companyId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a shift requirement' })
  @ApiOkResponse({ type: RequirementResponse })
  async findOne(@Param('id') id: string): Promise<RequirementResponse> {
    return this.requirements.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a shift requirement' })
  @ApiOkResponse({ type: RequirementResponse })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRequirementDto,
  ): Promise<RequirementResponse> {
    return this.requirements.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel a shift requirement' })
  @ApiOkResponse({ type: RequirementResponse })
  async remove(@Param('id') id: string): Promise<RequirementResponse> {
    return this.requirements.remove(id);
  }
}
