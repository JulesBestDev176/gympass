import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ValidateIf,
  Matches,
} from "class-validator";
export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10000000) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}
export class ProductsQuery extends PageQuery {
  @IsOptional() @IsIn(["true", "false"]) includeInactive = "false";
  @IsOptional() @IsIn(["all", "low", "empty"]) stock = "all";
}
export class SalesQuery extends PageQuery {
  @IsOptional() @IsIn(["today", "week", "month", "all", "custom"]) period =
    "month";
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  start?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  end?: string;
}
export class EditProductDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsString() @MaxLength(1000) photoUrl?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000000) priceFcfa?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) lowStockThreshold?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class CreateProductDto {
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsString() @MaxLength(1000) photoUrl?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) lowStockThreshold?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsString() @MaxLength(120) name: string;
  @IsInt() @Min(0) @Max(10000000) priceFcfa: number;
  @IsInt() @Min(0) @Max(1000000) initialStock: number;
}
export class StockDto {
  @IsUUID() requestId: string;
  @IsIn(["RESTOCK", "ADJUSTMENT"]) kind: string;
  @IsInt() @Min(-1000000) @Max(1000000) quantity: number;
  @IsString() @MaxLength(500) reason: string;
}
export class SaleItemDto {
  @IsString() @MaxLength(100) productId: string;
  @IsInt() @Min(1) @Max(10000) quantity: number;
  @IsInt() @Min(0) @Max(10000000) unitPrice: number;
  @IsString() @MaxLength(2000) priceToken: string;
}
export class CreateSaleDto {
  @IsUUID() requestId: string;
  @IsString() @MaxLength(100) deviceId: string;
  @IsDateString({ strict: true }) occurredAt: string;
  @IsBoolean() offline: boolean;
  @IsIn(["ESPECES", "WAVE", "ORANGE_MONEY"]) mode: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];
}
