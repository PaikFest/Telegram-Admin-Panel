import { IsString, Length } from 'class-validator';

export class ChangeCredentialsDto {
  @IsString()
  @Length(8, 200)
  currentPassword!: string;

  @IsString()
  @Length(3, 100)
  newLogin!: string;

  @IsString()
  @Length(8, 200)
  newPassword!: string;
}