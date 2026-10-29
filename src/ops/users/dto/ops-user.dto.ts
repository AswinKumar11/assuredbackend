import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OpsRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

import { normaliseEmail } from '../../auth/dto/ops-auth.dto';

const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;
const PASSWORD_HELP = `${PASSWORD_MIN}–${PASSWORD_MAX} characters`;

export class CreateOpsUserDto {
  @ApiProperty({ example: 'priya@assuredgig.in' })
  @Transform(normaliseEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ description: `Initial password, ${PASSWORD_HELP}. Share it out of band.` })
  @IsString()
  @Length(PASSWORD_MIN, PASSWORD_MAX)
  password: string;

  @ApiPropertyOptional({ enum: OpsRole, default: OpsRole.OPS })
  @IsOptional()
  @IsEnum(OpsRole)
  role?: OpsRole;
}

export class UpdateOpsUserDto {
  @ApiPropertyOptional({ enum: OpsRole })
  @IsOptional()
  @IsEnum(OpsRole)
  role?: OpsRole;

  @ApiPropertyOptional({
    description: 'true disables the account and ends its sessions; false re-enables it.',
  })
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;
}

export class ResetOpsPasswordDto {
  @ApiProperty({ description: `New password, ${PASSWORD_HELP}. Ends all of the user's sessions.` })
  @IsString()
  @Length(PASSWORD_MIN, PASSWORD_MAX)
  password: string;
}

export class OpsUserResponse {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: OpsRole }) role: OpsRole;
  @ApiProperty() disabled: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  disabledAt: Date | null;
  @ApiProperty() createdAt: Date;
}
