import { Injectable } from '@nestjs/common';
import { Prisma, Requirement, RequirementStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../shared/errors/app.exception';
import { ErrorCode } from '../shared/errors/error-codes';
import {
  CreateRequirementDto,
  RequirementResponse,
  UpdateRequirementDto,
} from './dto/requirement.dto';

@Injectable()
export class RequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRequirementDto): Promise<RequirementResponse> {
    const companyId = await this.resolveCompanyId(dto.companyId, dto.companyName);

    const requirement = await this.prisma.requirement.create({
      data: {
        companyId,
        role: dto.role,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        headcount: dto.headcount,
        payPaise: dto.payPaise,
        highValue: dto.highValue ?? false,
        notes: dto.notes,
      },
    });
    return this.toResponse(requirement);
  }

  async findAll(filter: {
    status?: RequirementStatus;
    companyId?: string;
  }): Promise<RequirementResponse[]> {
    const requirements = await this.prisma.requirement.findMany({
      where: {
        status: filter.status,
        companyId: filter.companyId,
      },
      orderBy: { startsAt: 'desc' },
    });
    return requirements.map((r) => this.toResponse(r));
  }

  async findOne(id: string): Promise<RequirementResponse> {
    const requirement = await this.prisma.requirement.findUnique({ where: { id } });
    if (!requirement) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Requirement not found');
    }
    return this.toResponse(requirement);
  }

  async update(id: string, dto: UpdateRequirementDto): Promise<RequirementResponse> {
    await this.findOne(id);

    if (dto.companyId !== undefined) {
      const company = await this.prisma.company.findUnique({
        where: { id: dto.companyId },
      });
      if (!company) {
        throw new AppException(ErrorCode.NOT_FOUND, 'Company not found');
      }
    }

    const data: Prisma.RequirementUpdateInput = {};
    if (dto.companyId !== undefined) data.company = { connect: { id: dto.companyId } };
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.startsAt !== undefined) data.startsAt = new Date(dto.startsAt);
    if (dto.endsAt !== undefined) data.endsAt = new Date(dto.endsAt);
    if (dto.headcount !== undefined) data.headcount = dto.headcount;
    if (dto.payPaise !== undefined) data.payPaise = dto.payPaise;
    if (dto.highValue !== undefined) data.highValue = dto.highValue;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const requirement = await this.prisma.requirement.update({ where: { id }, data });
    return this.toResponse(requirement);
  }

  /** Soft cancel: requirements are never hard-deleted once bookings can reference them. */
  async remove(id: string): Promise<RequirementResponse> {
    await this.findOne(id);
    const requirement = await this.prisma.requirement.update({
      where: { id },
      data: { status: RequirementStatus.CANCELLED },
    });
    return this.toResponse(requirement);
  }

  /**
   * Testing convenience: a companyName with no matching Company
   * auto-creates one with placeholder coordinates.
   * Real company CRUD doesn't exist yet, so this stands in for it.
   */
  private async resolveCompanyId(
    companyId: string | undefined,
    companyName: string | undefined,
  ): Promise<string> {
    if (companyId !== undefined) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
      });
      if (!company) {
        throw new AppException(ErrorCode.NOT_FOUND, 'Company not found');
      }
      return company.id;
    }

    if (companyName !== undefined) {
      const existing = await this.prisma.company.findFirst({
        where: { name: { equals: companyName, mode: 'insensitive' } },
      });
      if (existing) return existing.id;

      const company = await this.prisma.company.create({
        data: { name: companyName, lat: 0, lng: 0 },
      });
      return company.id;
    }

    throw new AppException(ErrorCode.VALIDATION_FAILED, 'companyId or companyName is required');
  }

  private toResponse(requirement: Requirement): RequirementResponse {
    return {
      id: requirement.id,
      companyId: requirement.companyId,
      role: requirement.role,
      startsAt: requirement.startsAt,
      endsAt: requirement.endsAt,
      headcount: requirement.headcount,
      payPaise: requirement.payPaise,
      highValue: requirement.highValue,
      status: requirement.status,
      notes: requirement.notes,
      createdAt: requirement.createdAt,
      updatedAt: requirement.updatedAt,
    };
  }
}
