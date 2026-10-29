import { Body, Controller, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OpsRole } from '@prisma/client';

import { CurrentPrincipal, Principal } from '../../shared/auth/current-principal';
import { Roles } from '../../shared/auth/roles.decorator';
import { OpsRoles, OpsRolesGuard } from '../ops-roles.guard';
import {
  CreateOpsUserDto,
  OpsUserResponse,
  ResetOpsPasswordDto,
  UpdateOpsUserDto,
} from './dto/ops-user.dto';
import { OpsUsersService } from './ops-users.service';

/** Ops account management. ADMIN only. */
@ApiTags('ops-users')
@ApiBearerAuth()
@Controller('ops/users')
@Roles('ops')
@OpsRoles(OpsRole.ADMIN)
@UseGuards(OpsRolesGuard)
export class OpsUsersController {
  constructor(private readonly users: OpsUsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create an ops user' })
  @ApiOkResponse({ type: OpsUserResponse })
  async create(@Body() dto: CreateOpsUserDto): Promise<OpsUserResponse> {
    return this.users.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: "Change an ops user's role, or disable / re-enable them" })
  @ApiOkResponse({ type: OpsUserResponse })
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOpsUserDto,
  ): Promise<OpsUserResponse> {
    return this.users.update(principal.sub, id, dto);
  }

  @Post(':id/password')
  @ApiOperation({ summary: 'Set a new password for an ops user and end their sessions' })
  @ApiOkResponse({ type: OpsUserResponse })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetOpsPasswordDto,
  ): Promise<OpsUserResponse> {
    return this.users.resetPassword(id, dto);
  }
}
