import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

import { RequirementStatus } from '@prisma/client';

const REQUIREMENT_STATUSES = Object.values(RequirementStatus);

export class CreateRequirementDto {
  @ApiPropertyOptional({
    description: 'Existing Company id. One of companyId/companyName is required.',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({
    description:
      'Company name for quick testing. Reuses a matching Company if one exists, ' +
      'otherwise auto-creates one with placeholder coordinates. ' +
      'One of companyId/companyName is required.',
  })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  companyName?: string;

  @ApiProperty()
  @IsString()
  @Length(2, 80)
  role: string;

  @ApiProperty()
  @IsDateString()
  startsAt: string;

  @ApiProperty()
  @IsDateString()
  endsAt: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  headcount: number;

  @ApiProperty({ description: 'Integer paise. No floats anywhere in money.' })
  @IsInt()
  @Min(0)
  payPaise: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  highValue?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}

export class UpdateRequirementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 80)
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  headcount?: number;

  @ApiPropertyOptional({ description: 'Integer paise. No floats anywhere in money.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  payPaise?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  highValue?: boolean;

  @ApiPropertyOptional({ enum: REQUIREMENT_STATUSES })
  @IsOptional()
  @IsIn(REQUIREMENT_STATUSES)
  status?: RequirementStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}

export class RequirementResponse {
  @ApiProperty() id: string;
  @ApiProperty() companyId: string;
  @ApiProperty() role: string;
  @ApiProperty() startsAt: Date;
  @ApiProperty() endsAt: Date;
  @ApiProperty() headcount: number;
  @ApiProperty() payPaise: number;
  @ApiProperty() highValue: boolean;
  @ApiProperty({ enum: REQUIREMENT_STATUSES }) status: RequirementStatus;
  @ApiProperty({ nullable: true }) notes: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
