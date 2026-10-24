import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateProductDto,
  EditProductDto,
  CreateSaleDto,
  PageQuery,
  ProductsQuery,
  SalesQuery,
  StockDto,
} from "./shop.dto";
type Actor = {
  gymId: string;
  id: string;
  role: string;
  prenom?: string;
  nom?: string;
};
@Injectable()
export class ShopService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {}
  private actor(a: Actor, admin = false) {
    if (
      !a.gymId ||
      !a.id ||
      !["ADMIN", "GERANT"].includes(a.role) ||
      (admin && a.role !== "ADMIN")
    )
      throw new ForbiddenException();
  }
  private name(a: Actor) {
    return [a.prenom, a.nom].filter(Boolean).join(" ") || a.id;
  }
  private hash(v: any) {
    const canonical = (value: any): any =>
      Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, canonical(value[key])]),
            )
          : value;
    return createHash("sha256")
      .update(JSON.stringify(canonical(v)))
      .digest("hex");
  }
  private sign(v: string) {
    const key =
      this.config.get<string>("SHOP_PRICE_SECRET") ||
      this.config.get<string>("JWT_SECRET");
    if (!key) throw new Error("Shop signing key missing");
    return createHmac("sha256", key)
      .update("shop-price-v1:" + v)
      .digest("base64url");
  }
  productView(p: any) {
    const body = Buffer.from(
      JSON.stringify({
        gym: p.gymId,
        id: p.id,
        price: p.priceFcfa,
        version: p.priceVersion ?? 1,
        issued: Date.now(),
      }),
    ).toString("base64url");
    const { gymId, ...view } = p;
    return { ...view, priceToken: body + "." + this.sign(body) };
  }
  private verify(
    token: string,
    a: Actor,
    p: any,
    price: number,
    at: Date,
    offline: boolean,
  ) {
    try {
      const [body, sig, ...extra] = token.split(".");
      const expected = this.sign(body);
      if (
        extra.length ||
        !sig ||
        sig.length !== expected.length ||
        !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
      )
        throw 0;
      const v = JSON.parse(Buffer.from(body, "base64url").toString());
      if (
        v.gym !== a.gymId ||
        v.id !== p.id ||
        v.price !== price ||
        !Number.isFinite(v.issued) ||
        v.issued > Date.now() + 300000 ||
        at.getTime() < v.issued - 300000 ||
        (!offline && Date.now() - v.issued > 180 * 86400000)
      )
        throw 0;
      if (
        !offline &&
        (p.priceFcfa !== price || (p.priceVersion ?? 1) !== v.version)
      )
        throw 0;
    } catch {
      throw new BadRequestException(
        "Prix expiré ou invalide. Actualisez le catalogue.",
      );
    }
  }
  private async lock(tx: any, gym: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`shop:${gym}`}))::text`;
  }
  private async get(tx: any, a: Actor, id: string) {
    const p = await tx.shopProduct.findFirst({ where: { id, gymId: a.gymId } });
    if (!p) throw new NotFoundException("Produit introuvable.");
    return p;
  }
  private photo(value: string) {
    if (!value) return null;
    const endpoint = this.config.get<string>("MINIO_ENDPOINT", "localhost"),
      port = this.config.get<string>("MINIO_PORT", "9000"),
      ssl = this.config.get<string>("MINIO_USE_SSL", "false") === "true";
    const prefix = `${ssl ? "https" : "http"}://${endpoint}:${port}/${this.config.get<string>("MINIO_BUCKET", "gympass")}/photos/`;
    if (
      !value.startsWith(prefix) ||
      !/^[a-zA-Z0-9-]+\.(png|jpe?g|webp)$/i.test(value.slice(prefix.length))
    )
      throw new BadRequestException(
        "Utilisez une photo importée dans GymPass.",
      );
    return value;
  }
  private edits(dto: EditProductDto) {
    const data: any = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException("Nom requis.");
      data.name = dto.name.trim();
    }
    for (const key of ["category", "priceFcfa", "lowStockThreshold", "active"])
      if (dto[key] !== undefined) data[key] = dto[key];
    if (dto.photoUrl !== undefined) data.photoUrl = this.photo(dto.photoUrl);
    return data;
  }
  async products(a: Actor, q: ProductsQuery) {
    this.actor(a, q.includeInactive === "true");
    const where: any = {
      gymId: a.gymId,
      ...(q.includeInactive === "true" ? {} : { active: true }),
      ...(q.search
        ? { name: { contains: q.search.trim(), mode: "insensitive" } }
        : {}),
    };
    if (q.stock === "empty") where.stock = { lte: 0 };
    if (q.stock === "low")
      where.stock = { lte: this.db.shopProduct.fields.lowStockThreshold };
    const [items, total] = await this.db.$transaction([
      this.db.shopProduct.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: q.offset,
        take: q.limit,
      }),
      this.db.shopProduct.count({ where }),
    ]);
    return {
      items: items.map((p) => this.productView(p)),
      total,
      nextOffset:
        q.offset + items.length < total ? q.offset + items.length : null,
    };
  }
  async product(a: Actor, id: string) {
    this.actor(a);
    const p = await this.get(this.db, a, id);
    if (!p.active && a.role !== "ADMIN") throw new NotFoundException();
    return this.productView(p);
  }
  async create(a: Actor, d: CreateProductDto) {
    this.actor(a, true);
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, a.gymId);
      const p = await tx.shopProduct.create({
        data: { ...this.edits(d), gymId: a.gymId, stock: d.initialStock },
      });
      if (d.initialStock)
        await tx.shopStockMovement.create({
          data: {
            gymId: a.gymId,
            productId: p.id,
            userId: a.id,
            userName: this.name(a),
            kind: "INITIAL",
            quantity: d.initialStock,
            reason: "Stock initial",
          },
        });
      return this.productView(p);
    });
  }
  async edit(a: Actor, id: string, d: EditProductDto) {
    this.actor(a, true);
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, a.gymId);
      await this.get(tx, a, id);
      return this.productView(
        await tx.shopProduct.update({
          where: { id },
          data: {
            ...this.edits(d),
            ...(d.priceFcfa !== undefined
              ? { priceVersion: { increment: 1 } }
              : {}),
          },
        }),
      );
    });
  }
  async stock(a: Actor, id: string, d: StockDto) {
    this.actor(a, true);
    if (
      !d.reason.trim() ||
      !d.quantity ||
      (d.kind === "RESTOCK" && d.quantity < 0)
    )
      throw new BadRequestException("Quantité et motif requis.");
    const fingerprint = this.hash({ id, userId: a.id, ...d });
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, a.gymId);
      const old = await tx.shopStockMovement.findUnique({
        where: { gymId_requestId: { gymId: a.gymId, requestId: d.requestId } },
      });
      if (old) {
        if (old.fingerprint !== fingerprint)
          throw new ConflictException("Requête déjà utilisée.");
        return this.productView(await this.get(tx, a, id));
      }
      const p = await this.get(tx, a, id);
      if (
        (p.stock + d.quantity < 0 && d.kind === "ADJUSTMENT") ||
        p.stock + d.quantity > 100000000
      )
        throw new ConflictException("Le stock corrigé doit être positif.");
      await tx.shopStockMovement.create({
        data: {
          ...d,
          gymId: a.gymId,
          productId: id,
          userId: a.id,
          userName: this.name(a),
          fingerprint,
        },
      });
      return this.productView(
        await tx.shopProduct.update({
          where: { id },
          data: { stock: { increment: d.quantity } },
        }),
      );
    });
  }
  async movements(a: Actor, id: string, q: PageQuery) {
    this.actor(a, true);
    await this.get(this.db, a, id);
    const where = { gymId: a.gymId, productId: id };
    const [items, total] = await this.db.$transaction([
      this.db.shopStockMovement.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: q.offset,
        take: q.limit,
      }),
      this.db.shopStockMovement.count({ where }),
    ]);
    return {
      items,
      total,
      nextOffset:
        q.offset + items.length < total ? q.offset + items.length : null,
    };
  }
  private saleView(s: any) {
    const { fingerprint, deviceId, gymId, ...view } = s;
    return { ...view, number: `B-${s.id}` };
  }
  async sell(a: Actor, d: CreateSaleDto) {
    this.actor(a);
    const fingerprint = this.hash({
      userId: a.id,
      ...d,
      items: [...d.items].sort((x, y) =>
        x.productId.localeCompare(y.productId),
      ),
    });
    return this.db.$transaction(
      async (tx) => {
        await this.lock(tx, a.gymId);
        const old = await tx.shopSale.findUnique({
          where: {
            gymId_requestId: { gymId: a.gymId, requestId: d.requestId },
          },
          include: { items: true },
        });
        if (old) {
          if (old.userId !== a.id || old.fingerprint !== fingerprint)
            throw new ConflictException("Requête déjà utilisée.");
          return this.saleView(old);
        }
        const at = new Date(d.occurredAt);
        if (
          !Number.isFinite(at.getTime()) ||
          at.getTime() > Date.now() + 300000 ||
          at.getTime() < Date.UTC(2020, 0, 1) ||
          !d.deviceId.trim() ||
          !["ESPECES", "WAVE", "ORANGE_MONEY"].includes(d.mode) ||
          typeof d.offline !== "boolean" ||
          d.items.length < 1 ||
          d.items.length > 100 ||
          new Set(d.items.map((i) => i.productId)).size !== d.items.length
        )
          throw new BadRequestException("Vente invalide.");
        let total = 0,
          stockConflict = false;
        const lines = [];
        for (const i of [...d.items].sort((x, y) =>
          x.productId.localeCompare(y.productId),
        )) {
          if (
            !Number.isInteger(i.quantity) ||
            i.quantity < 1 ||
            i.quantity > 10000 ||
            !Number.isInteger(i.unitPrice) ||
            i.unitPrice < 0 ||
            i.unitPrice > 10000000
          )
            throw new BadRequestException("Quantité ou prix invalide.");
          const p = await this.get(tx, a, i.productId);
          this.verify(i.priceToken, a, p, i.unitPrice, at, d.offline);
          if (!d.offline && (!p.active || p.stock < i.quantity))
            throw new ConflictException(
              "Stock insuffisant ou produit inactif.",
            );
          if (p.stock < i.quantity) stockConflict = true;
          const lineTotal = i.quantity * i.unitPrice;
          total += lineTotal;
          if (total > 2000000000)
            throw new BadRequestException("Montant trop élevé.");
          lines.push({
            productId: p.id,
            name: p.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            totalFcfa: lineTotal,
          });
          await tx.shopProduct.update({
            where: { id: p.id },
            data: { stock: { decrement: i.quantity } },
          });
          await tx.shopStockMovement.create({
            data: {
              gymId: a.gymId,
              productId: p.id,
              userId: a.id,
              userName: this.name(a),
              kind: d.offline ? "OFFLINE_SALE" : "SALE",
              quantity: -i.quantity,
              reason: `Vente ${d.requestId}`,
            },
          });
        }
        const s = await tx.shopSale.create({
          data: {
            gymId: a.gymId,
            userId: a.id,
            userName: this.name(a),
            requestId: d.requestId,
            fingerprint,
            deviceId: d.deviceId,
            occurredAt: at,
            offline: d.offline,
            mode: d.mode,
            totalFcfa: total,
            stockConflict,
            items: { create: lines },
          },
          include: { items: true },
        });
        return this.saleView(s);
      },
      { maxWait: 15000, timeout: 30000 },
    );
  }
  private visibility(a: Actor, q?: SalesQuery) {
    this.actor(a);
    const where: any = { gymId: a.gymId };
    const now = new Date();
    let start: Date, end: Date;
    if (a.role === "GERANT" || q?.period === "week") {
      start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
      end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
    } else if (q?.period === "today") {
      start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      end = new Date(start.getTime() + 86400000);
    } else if (q?.period === "month") {
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    } else if (q?.period === "custom") {
      if (!q.start || !q.end)
        throw new BadRequestException("Choisissez les deux dates.");
      start = new Date(q.start + "T00:00:00Z");
      end = new Date(q.end + "T00:00:00Z");
      if (
        !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        end < start
      )
        throw new BadRequestException("Période invalide.");
      end = new Date(end.getTime() + 86400000);
    }
    if (start) where.occurredAt = { gte: start, lt: end };
    if (a.role === "GERANT") where.userId = a.id;
    if (q?.search?.trim())
      where.OR = [
        { userName: { contains: q.search.trim(), mode: "insensitive" } },
        {
          items: {
            some: { name: { contains: q.search.trim(), mode: "insensitive" } },
          },
        },
        { id: { contains: q.search.trim() } },
      ];
    return where;
  }
  async sales(a: Actor, q: SalesQuery) {
    const where = this.visibility(a, q);
    const [items, total, amount] = await this.db.$transaction([
      this.db.shopSale.findMany({
        where,
        include: { items: true },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: q.offset,
        take: q.limit,
      }),
      this.db.shopSale.count({ where }),
      this.db.shopSale.aggregate({ where, _sum: { totalFcfa: true } }),
    ]);
    return {
      items: items.map((s) => this.saleView(s)),
      total,
      amountFcfa: amount._sum.totalFcfa || 0,
      nextOffset:
        q.offset + items.length < total ? q.offset + items.length : null,
    };
  }
  async sale(a: Actor, id: string, request = false) {
    const s = await this.db.shopSale.findFirst({
      where: {
        ...this.visibility(a),
        ...(request ? { requestId: id } : { id }),
      },
      include: { items: true },
    });
    if (!s) throw new NotFoundException();
    return this.saleView(s);
  }
}
