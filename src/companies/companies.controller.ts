import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../shared/auth/roles.decorator';
import { CompaniesService } from './companies.service';
import { CompanyResponse, CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';

/** Every route is @Public() until ops auth lands — see CompaniesModule. */
@ApiTags('companies')
@Controller('companies')
@Public()
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a company' })
  @ApiOkResponse({ type: CompanyResponse })
  async create(@Body() dto: CreateCompanyDto): Promise<CompanyResponse> {
    return this.companies.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List companies' })
  @ApiOkResponse({ type: [CompanyResponse] })
  async findAll(@Query('active') active?: string): Promise<CompanyResponse[]> {
    return this.companies.findAll({ active: active === undefined ? undefined : active === 'true' });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a company' })
  @ApiOkResponse({ type: CompanyResponse })
  async findOne(@Param('id') id: string): Promise<CompanyResponse> {
    return this.companies.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a company' })
  @ApiOkResponse({ type: CompanyResponse })
  async update(@Param('id') id: string, @Body() dto: UpdateCompanyDto): Promise<CompanyResponse> {
    return this.companies.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a company' })
  @ApiOkResponse({ type: CompanyResponse })
  async remove(@Param('id') id: string): Promise<CompanyResponse> {
    return this.companies.remove(id);
  }
}
