import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export const normaliseEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class OpsLoginDto {
  @ApiProperty({ example: 'ops@assuredgig.in' })
  @Transform(normaliseEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty()
  @IsString()
  @Length(1, 128)
  password: string;
}

export class OpsRefreshDto {
  @ApiProperty()
  @IsString()
  @Length(16, 512)
  refreshToken: string;
}
