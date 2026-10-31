import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { UUID_SHAPE, UUID_SHAPE_MSG } from '../validation/id-shape';

/**
 * P2-164: route-param shape guard. All KoraLink ids are varchar(36) holding
 * UUID-shaped strings, so a malformed :id / :slotId is rejected with 400
 * before it reaches a service. Per-route use only:
 *   @Param('id', UuidParamPipe) id: string
 */
@Injectable()
export class UuidParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !UUID_SHAPE.test(value)) {
      throw new BadRequestException(`Route param ${UUID_SHAPE_MSG}`);
    }
    return value;
  }
}
