import { Injectable } from '@nestjs/common';
import { Company, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../shared/errors/app.exception';
import { ErrorCode } from '../shared/errors/error-codes';
import { CompanyResponse, CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCompanyDto): Promise<CompanyResponse> {
    const company = await this.prisma.company.create({
      data: {
        name: dto.name,
        addressLine: dto.addressLine,
        state: dto.state,
        district: dto.district,
        constituency: dto.constituency,
        lat: dto.lat,
        lng: dto.lng,
        geofenceRadiusM: dto.geofenceRadiusM,
      },
    });
    return this.toResponse(company);
  }

  async findAll(filter: { active?: boolean }): Promise<CompanyResponse[]> {
    const companies = await this.prisma.company.findMany({
      where: { active: filter.active },
      orderBy: { createdAt: 'desc' },
    });
    return companies.map((c) => this.toResponse(c));
  }

  async findOne(id: string): Promise<CompanyResponse> {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Company not found');
    }
    return this.toResponse(company);
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<CompanyResponse> {
    await this.findOne(id);

    const data: Prisma.CompanyUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.addressLine !== undefined) data.addressLine = dto.addressLine;
    if (dto.state !== undefined) data.state = dto.state;
    if (dto.district !== undefined) data.district = dto.district;
    if (dto.constituency !== undefined) data.constituency = dto.constituency;
    if (dto.lat !== undefined) data.lat = dto.lat;
    if (dto.lng !== undefined) data.lng = dto.lng;
    if (dto.geofenceRadiusM !== undefined) data.geofenceRadiusM = dto.geofenceRadiusM;

    const company = await this.prisma.company.update({ where: { id }, data });
    return this.toResponse(company);
  }

  /** Soft deactivate: companies are never hard-deleted once requirements can reference them. */
  async remove(id: string): Promise<CompanyResponse> {
    await this.findOne(id);
    const company = await this.prisma.company.update({
      where: { id },
      data: { active: false },
    });
    return this.toResponse(company);
  }

  private toResponse(company: Company): CompanyResponse {
    return {
      id: company.id,
      name: company.name,
      active: company.active,
      addressLine: company.addressLine,
      state: company.state,
      district: company.district,
      constituency: company.constituency,
      lat: company.lat,
      lng: company.lng,
      geofenceRadiusM: company.geofenceRadiusM,
      createdAt: company.createdAt,
    };
  }
}
