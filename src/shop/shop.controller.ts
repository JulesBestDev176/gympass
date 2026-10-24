import { ShopScopeGuard } from "./shop-scope.guard";
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ShopService } from "./shop.service";
import {
  CreateProductDto,
  EditProductDto,
  CreateSaleDto,
  PageQuery,
  ProductsQuery,
  SalesQuery,
  StockDto,
} from "./shop.dto";
@UseGuards(JwtAuthGuard, ShopScopeGuard)
@Controller("shop")
export class ShopController {
  constructor(private readonly s: ShopService) {}
  @Get("products") products(@CurrentUser() a: any, @Query() q: ProductsQuery) {
    return this.s.products(a, q);
  }
  @Post("products") create(@CurrentUser() a: any, @Body() d: CreateProductDto) {
    return this.s.create(a, d);
  }
  @Get("products/:id") product(@CurrentUser() a: any, @Param("id") id: string) {
    return this.s.product(a, id);
  }
  @Patch("products/:id") edit(
    @CurrentUser() a: any,
    @Param("id") id: string,
    @Body() d: EditProductDto,
  ) {
    return this.s.edit(a, id, d);
  }
  @Post("products/:id/stock") stock(
    @CurrentUser() a: any,
    @Param("id") id: string,
    @Body() d: StockDto,
  ) {
    return this.s.stock(a, id, d);
  }
  @Get("products/:id/movements") movements(
    @CurrentUser() a: any,
    @Param("id") id: string,
    @Query() q: PageQuery,
  ) {
    return this.s.movements(a, id, q);
  }
  @Post("sales") sell(@CurrentUser() a: any, @Body() d: CreateSaleDto) {
    return this.s.sell(a, d);
  }
  @Get("sales") sales(@CurrentUser() a: any, @Query() q: SalesQuery) {
    return this.s.sales(a, q);
  }
  @Get("sales/request/:requestId") request(
    @CurrentUser() a: any,
    @Param("requestId") id: string,
  ) {
    return this.s.sale(a, id, true);
  }
  @Get("sales/:id") sale(@CurrentUser() a: any, @Param("id") id: string) {
    return this.s.sale(a, id);
  }
}
