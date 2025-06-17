import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SpreadDataService } from './services/spread-data.service';
import { Strategy1Service } from './services/strategy1.service';
import { Strategy2Service } from './services/strategy2.service';
import { StrategyAllocatorService } from './services/strategy-allocator.service';
import { StrategySchedulerService } from './services/strategy-scheduler.service';
import { CommissionService } from './services/commission.service';
import { FundingMonitoringService } from './services/funding-monitoring.service';
import { GoogleSheetsService } from './services/google-sheets.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 3,
    }),
    ScheduleModule.forRoot()
  ],
  controllers: [AppController],
  providers: [
    AppService,
    SpreadDataService,
    Strategy1Service,
    Strategy2Service,
    StrategyAllocatorService,
    StrategySchedulerService,
    CommissionService,
    FundingMonitoringService,
    GoogleSheetsService
  ],
})
export class AppModule {}
