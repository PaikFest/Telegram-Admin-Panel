import { IsOptional, IsString, Length } from 'class-validator';

export class CreateBroadcastMediaDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 4000)
  text?: string;
}
