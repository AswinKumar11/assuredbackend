import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty()
  @IsString()
  @Length(2, 120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 200)
  addressLine?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 80)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 80)
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 120)
  constituency?: string;

  @ApiProperty({
    description:
      'Geofence centre — every requirement posted under this company checks in against it.',
  })
  @IsLatitude()
  lat: number;

  @ApiProperty({
    description:
      'Geofence centre — every requirement posted under this company checks in against it.',
  })
  @IsLongitude()
  lng: number;

  @ApiPropertyOptional({ description: 'Overrides the platform-wide geofence radius default.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  geofenceRadiusM?: number;
}

export class UpdateCompanyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 200)
  addressLine?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 80)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 80)
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 120)
  constituency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  geofenceRadiusM?: number;
}

export class CompanyResponse {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() active: boolean;
  @ApiProperty({ nullable: true }) addressLine: string | null;
  @ApiProperty({ nullable: true }) state: string | null;
  @ApiProperty({ nullable: true }) district: string | null;
  @ApiProperty({ nullable: true }) constituency: string | null;
  @ApiProperty() lat: number;
  @ApiProperty() lng: number;
  @ApiProperty({ nullable: true }) geofenceRadiusM: number | null;
  @ApiProperty() createdAt: Date;
}
