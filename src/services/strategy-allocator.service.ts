import { Injectable, Logger } from '@nestjs/common';
import { StrategyOpportunity } from '../interfaces/strategy-config.interface';
import { CommissionService } from './commission.service';

export interface StrategyDecision {
  action: 'enter_strategy1' | 'enter_strategy2' | 'enter_both' | 'skip';
  selectedOpportunities: StrategyOpportunity[];
  reason: string;
  totalPotentialProfit: number;
  totalCommissions: number;
  netProfit: number;
  positionSize: number;
}

@Injectable()
export class StrategyAllocatorService {
  private readonly logger = new Logger(StrategyAllocatorService.name);
  private readonly POSITION_SIZE = 1000; // $1000 размер позиции

  constructor(private readonly commissionService: CommissionService) {}

  /**
   * Принимает решение о выборе стратегии на основе найденных возможностей
   * @param strategy1Opportunities Возможности от Strategy 1
   * @param strategy2Opportunities Возможности от Strategy 2
   * @returns Решение о действии
   */
  allocateStrategy(
    strategy1Opportunities: StrategyOpportunity[],
    strategy2Opportunities: StrategyOpportunity[]
  ): StrategyDecision {
    
    // Если нет возможностей ни в одной стратегии
    if (strategy1Opportunities.length === 0 && strategy2Opportunities.length === 0) {
      return {
        action: 'skip',
        selectedOpportunities: [],
        reason: 'Нет подходящих возможностей ни в одной стратегии',
        totalPotentialProfit: 0,
        totalCommissions: 0,
        netProfit: 0,
        positionSize: this.POSITION_SIZE
      };
    }

    // Берем лучшую возможность из каждой стратегии и рассчитываем чистую прибыль
    const bestStrategy1 = strategy1Opportunities.length > 0 
      ? this.calculateNetProfit(strategy1Opportunities[0]) 
      : null;
    const bestStrategy2 = strategy2Opportunities.length > 0 
      ? this.calculateNetProfit(strategy2Opportunities[0]) 
      : null;

    // Если есть только Strategy 1
    if (bestStrategy1 && !bestStrategy2) {
      return {
        action: 'enter_strategy1',
        selectedOpportunities: [bestStrategy1.opportunity],
        reason: `Только Strategy 1 доступна: ${bestStrategy1.opportunity.ticker}, чистая прибыль: $${bestStrategy1.netProfit.toFixed(4)}`,
        totalPotentialProfit: bestStrategy1.grossProfit,
        totalCommissions: bestStrategy1.totalCommissions,
        netProfit: bestStrategy1.netProfit,
        positionSize: this.POSITION_SIZE
      };
    }

    // Если есть только Strategy 2
    if (bestStrategy2 && !bestStrategy1) {
      return {
        action: 'enter_strategy2',
        selectedOpportunities: [bestStrategy2.opportunity],
        reason: `Только Strategy 2 доступна: ${bestStrategy2.opportunity.ticker}, чистая прибыль: $${bestStrategy2.netProfit.toFixed(4)}`,
        totalPotentialProfit: bestStrategy2.grossProfit,
        totalCommissions: bestStrategy2.totalCommissions,
        netProfit: bestStrategy2.netProfit,
        positionSize: this.POSITION_SIZE
      };
    }

    // Если есть обе стратегии
    if (bestStrategy1 && bestStrategy2) {
      // Проверяем, разные ли это тикеры
      if (bestStrategy1.opportunity.ticker !== bestStrategy2.opportunity.ticker) {
        // Разные тикеры - можем войти в обе (если хватает капитала)
        const totalGrossProfit = bestStrategy1.grossProfit + bestStrategy2.grossProfit;
        const totalCommissions = bestStrategy1.totalCommissions + bestStrategy2.totalCommissions;
        const totalNetProfit = bestStrategy1.netProfit + bestStrategy2.netProfit;
        
        return {
          action: 'enter_both',
          selectedOpportunities: [bestStrategy1.opportunity, bestStrategy2.opportunity],
          reason: `Разные тикеры: ${bestStrategy1.opportunity.ticker} (чистая: $${bestStrategy1.netProfit.toFixed(4)}) и ${bestStrategy2.opportunity.ticker} (чистая: $${bestStrategy2.netProfit.toFixed(4)})`,
          totalPotentialProfit: totalGrossProfit,
          totalCommissions: totalCommissions,
          netProfit: totalNetProfit,
          positionSize: this.POSITION_SIZE * 2
        };
      } else {
        // Один и тот же тикер - выбираем лучшую по ЧИСТОЙ прибыли
        if (bestStrategy1.netProfit >= bestStrategy2.netProfit) {
          return {
            action: 'enter_strategy1',
            selectedOpportunities: [bestStrategy1.opportunity],
            reason: `Strategy 1 выгоднее для ${bestStrategy1.opportunity.ticker}: чистая прибыль $${bestStrategy1.netProfit.toFixed(4)} vs $${bestStrategy2.netProfit.toFixed(4)}`,
            totalPotentialProfit: bestStrategy1.grossProfit,
            totalCommissions: bestStrategy1.totalCommissions,
            netProfit: bestStrategy1.netProfit,
            positionSize: this.POSITION_SIZE
          };
        } else {
          return {
            action: 'enter_strategy2',
            selectedOpportunities: [bestStrategy2.opportunity],
            reason: `Strategy 2 выгоднее для ${bestStrategy2.opportunity.ticker}: чистая прибыль $${bestStrategy2.netProfit.toFixed(4)} vs $${bestStrategy1.netProfit.toFixed(4)}`,
            totalPotentialProfit: bestStrategy2.grossProfit,
            totalCommissions: bestStrategy2.totalCommissions,
            netProfit: bestStrategy2.netProfit,
            positionSize: this.POSITION_SIZE
          };
        }
      }
    }

    // Fallback (не должно сюда дойти)
    return {
      action: 'skip',
      selectedOpportunities: [],
      reason: 'Неопределенная ситуация',
      totalPotentialProfit: 0,
      totalCommissions: 0,
      netProfit: 0,
      positionSize: this.POSITION_SIZE
    };
  }

  /**
   * Рассчитывает чистую прибыль с учетом комиссий
   */
  private calculateNetProfit(opportunity: StrategyOpportunity) {
    // Валовая прибыль от спреда
    const grossProfit = opportunity.fundingDiff * this.POSITION_SIZE;
    
    // Рассчитываем комиссии (используем более выгодный тип - лимит+маркет)
    const marketCommissions = this.commissionService.calculateCommissions(
      opportunity.longExchange,
      opportunity.shortExchange,
      this.POSITION_SIZE,
      false // все маркет ордера
    );
    
    const limitMarketCommissions = this.commissionService.calculateCommissions(
      opportunity.longExchange,
      opportunity.shortExchange,
      this.POSITION_SIZE,
      true // лимит на вход + маркет на выход
    );

    // Выбираем более выгодный тип комиссий
    const bestCommissions = limitMarketCommissions.totalCommission < marketCommissions.totalCommission 
      ? limitMarketCommissions 
      : marketCommissions;

    const netProfit = grossProfit - bestCommissions.totalCommission;

    return {
      opportunity,
      grossProfit,
      totalCommissions: bestCommissions.totalCommission,
      netProfit,
      commissionType: bestCommissions.commissionType
    };
  }

  /**
   * Анализирует и логирует все найденные возможности
   * @param strategy1Opportunities Возможности от Strategy 1
   * @param strategy2Opportunities Возможности от Strategy 2
   * @returns Решение с детальной информацией
   */
  analyzeAndDecide(
    strategy1Opportunities: StrategyOpportunity[],
    strategy2Opportunities: StrategyOpportunity[]
  ): StrategyDecision {
    
    // Логируем найденные возможности
    this.logOpportunities('Strategy 1 (Rate Arbitrage)', strategy1Opportunities);
    this.logOpportunities('Strategy 2 (Timing Arbitrage)', strategy2Opportunities);

    // Принимаем решение
    const decision = this.allocateStrategy(strategy1Opportunities, strategy2Opportunities);

    // Логируем решение
    this.logger.log(`
🎯 РЕШЕНИЕ STRATEGY ALLOCATOR:
Действие: ${decision.action.toUpperCase()}
Причина: ${decision.reason}
Размер позиции: $${decision.positionSize}
Валовая прибыль: $${decision.totalPotentialProfit.toFixed(4)} (${(decision.totalPotentialProfit/decision.positionSize*100).toFixed(4)}%)
Комиссии: $${decision.totalCommissions.toFixed(4)}
ЧИСТАЯ ПРИБЫЛЬ: $${decision.netProfit.toFixed(4)} (${(decision.netProfit/decision.positionSize*100).toFixed(4)}%)
Выбранных возможностей: ${decision.selectedOpportunities.length}
    `);

    return decision;
  }

  /**
   * Логирует возможности стратегии
   */
  private logOpportunities(strategyName: string, opportunities: StrategyOpportunity[]): void {
    if (opportunities.length === 0) {
      this.logger.log(`❌ ${strategyName}: возможностей не найдено`);
      return;
    }

    this.logger.log(`✅ ${strategyName}: найдено ${opportunities.length} возможностей`);
    
    // Показываем топ-3
    opportunities.slice(0, 3).forEach((opp, index) => {
      const profitPercent = (opp.fundingDiff * 100).toFixed(4);
      const timeToFunding = opp.timeToFunding.toFixed(1);
      
      if (opp.strategy === 'rate_arbitrage') {
        this.logger.log(`  ${index + 1}. ${opp.ticker}: ${opp.longExchange}(${(opp.longFundingRate * 100).toFixed(4)}%) / ${opp.shortExchange}(${(opp.shortFundingRate * 100).toFixed(4)}%) = ${profitPercent}% спред, до выплаты: ${timeToFunding}мин`);
      } else {
        this.logger.log(`  ${index + 1}. ${opp.ticker}: ${opp.longExchange}(|${(Math.abs(opp.longFundingRate) * 100).toFixed(4)}%|) → ${opp.shortExchange}(|${(Math.abs(opp.shortFundingRate) * 100).toFixed(4)}%|), потенциал: ${profitPercent}%, до первой выплаты: ${timeToFunding}мин`);
      }
    });
  }

  /**
   * Получает статистику по принятым решениям
   */
  getDecisionStats(decisions: StrategyDecision[]): any {
    const stats = {
      total: decisions.length,
      strategy1: decisions.filter(d => d.action === 'enter_strategy1').length,
      strategy2: decisions.filter(d => d.action === 'enter_strategy2').length,
      both: decisions.filter(d => d.action === 'enter_both').length,
      skipped: decisions.filter(d => d.action === 'skip').length,
      totalPotentialProfit: decisions.reduce((sum, d) => sum + d.totalPotentialProfit, 0)
    };

    return {
      ...stats,
      successRate: ((stats.strategy1 + stats.strategy2 + stats.both) / stats.total * 100).toFixed(1) + '%',
      avgPotentialProfit: stats.total > 0 ? (stats.totalPotentialProfit / stats.total * 100).toFixed(4) + '%' : '0%'
    };
  }
}
