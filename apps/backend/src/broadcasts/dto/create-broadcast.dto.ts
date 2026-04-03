import { IsOptional, IsString, Length } from 'class-validator';

export class CreateBroadcastDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  title?: string;

  @IsString()
  @Length(1, 4000)
  text!: string;
}