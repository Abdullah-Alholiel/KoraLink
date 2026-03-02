import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReferenceType, TransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface LedgerEntryDto {
  type: TransactionType;
  amount: number;
  referenceType: ReferenceType;
  referenceId?: string;
  idempotencyKey: string;
}

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates an immutable ledger entry and updates the user's wallet balance
   * atomically using a Prisma interactive transaction.
   *
   * The `idempotency_key` unique constraint ensures that retried requests
   * (e.g. from a payment gateway webhook) cannot double-charge the user.
   */
  async recordTransaction(userId: string, entry: LedgerEntryDto) {
    const { type, amount, referenceType, referenceId, idempotencyKey } = entry;

    if (amount <= 0) {
      throw new BadRequestException('Transaction amount must be positive.');
    }

    // Check for duplicate idempotency key before entering the transaction.
    const existing = await this.prisma.transaction.findUnique({
      where: { idempotency_key: idempotencyKey },
    });
    if (existing) {
      throw new ConflictException('Duplicate transaction: idempotency key already used.');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Create the immutable ledger entry.
      const ledgerEntry = await tx.transaction.create({
        data: {
          user_id: userId,
          type,
          amount: new Decimal(amount),
          reference_type: referenceType,
          reference_id: referenceId,
          idempotency_key: idempotencyKey,
          status: 'Completed',
        },
      });

      // 2. Update the wallet balance — increment for CREDIT, decrement for DEBIT.
      const balanceDelta = type === TransactionType.CREDIT ? amount : -amount;

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { wallet_balance: { increment: balanceDelta } },
        select: { id: true, wallet_balance: true },
      });

      // 3. Guard against negative balance on DEBIT.
      if (updatedUser.wallet_balance.lessThan(0)) {
        throw new BadRequestException('Insufficient wallet balance.');
      }

      return { ledgerEntry, wallet_balance: updatedUser.wallet_balance };
    });
  }

  async getBalance(userId: string): Promise<Decimal> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { wallet_balance: true },
    });
    return user.wallet_balance;
  }

  async getHistory(userId: string, page = 1, perPage = 20) {
    const skip = (page - 1) * perPage;
    return this.prisma.transaction.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      skip,
      take: perPage,
    });
  }
}
