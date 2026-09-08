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
    const locationId = await this.resolveLocationId(dto.locationId, dto.locationName);

    const requirement = await this.prisma.requirement.create({
      data: {
        locationId,
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
    locationId?: string;
  }): Promise<RequirementResponse[]> {
    const requirements = await this.prisma.requirement.findMany({
      where: {
        status: filter.status,
        locationId: filter.locationId,
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

    if (dto.locationId !== undefined) {
      const location = await this.prisma.companyLocation.findUnique({
        where: { id: dto.locationId },
      });
      if (!location) {
        throw new AppException(ErrorCode.NOT_FOUND, 'Location not found');
      }
    }

    const data: Prisma.RequirementUpdateInput = {};
    if (dto.locationId !== undefined) data.location = { connect: { id: dto.locationId } };
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
   * Testing convenience: a locationName with no matching CompanyLocation
   * auto-creates a Company + CompanyLocation with placeholder coordinates.
   * Real company/location CRUD doesn't exist yet, so this stands in for it.
   */
  private async resolveLocationId(
    locationId: string | undefined,
    locationName: string | undefined,
  ): Promise<string> {
    if (locationId !== undefined) {
      const location = await this.prisma.companyLocation.findUnique({
        where: { id: locationId },
      });
      if (!location) {
        throw new AppException(ErrorCode.NOT_FOUND, 'Location not found');
      }
      return location.id;
    }

    if (locationName !== undefined) {
      const existing = await this.prisma.companyLocation.findFirst({
        where: { name: { equals: locationName, mode: 'insensitive' } },
      });
      if (existing) return existing.id;

      const company = await this.prisma.company.create({ data: { name: locationName } });
      const location = await this.prisma.companyLocation.create({
        data: { companyId: company.id, name: locationName, lat: 0, lng: 0 },
      });
      return location.id;
    }

    throw new AppException(ErrorCode.VALIDATION_FAILED, 'locationId or locationName is required');
  }

  private toResponse(requirement: Requirement): RequirementResponse {
    return {
      id: requirement.id,
      locationId: requirement.locationId,
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
