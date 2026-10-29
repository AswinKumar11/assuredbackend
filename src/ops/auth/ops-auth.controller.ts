import { Body, Controller, Ip, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { TokenPair } from '../../auth/token.service';
import { CurrentPrincipal, Principal } from '../../shared/auth/current-principal';
import { Public, Roles } from '../../shared/auth/roles.decorator';
import { OpsLoginDto, OpsRefreshDto } from './dto/ops-auth.dto';
import { OpsAuthService, OpsLoginResult } from './ops-auth.service';

@ApiTags('ops-auth')
@Controller('ops/auth')
export class OpsAuthController {
  constructor(private readonly auth: OpsAuthService) {}

  @Post('login')
  @Public()
  @ApiOperation({ summary: 'Sign in to the ops console with email and password' })
  @ApiOkResponse({ description: 'Session issued' })
  async login(@Body() dto: OpsLoginDto, @Ip() ip: string): Promise<OpsLoginResult> {
    return this.auth.login(dto.email, dto.password, ip);
  }

  @Post('refresh')
  @Public()
  @ApiOperation({ summary: 'Rotate an ops refresh token' })
  async refresh(@Body() dto: OpsRefreshDto): Promise<TokenPair> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @Roles('ops')
  @ApiOperation({ summary: 'Revoke every session for the signed-in ops user' })
  async logout(@CurrentPrincipal() principal: Principal): Promise<{ status: string }> {
    await this.auth.logout(principal.sub);
    return { status: 'ok' };
  }
}
