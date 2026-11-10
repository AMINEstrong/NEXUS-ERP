import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export const DASHBOARD_RANGES = ["7d", "30d", "90d", "6m", "12m", "ytd"] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export class DashboardQueryDto {
  @IsOptional()
  @IsIn(DASHBOARD_RANGES)
  range?: DashboardRange;
}

export class DashboardSearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  q!: string;
}
