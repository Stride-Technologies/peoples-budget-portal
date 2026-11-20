import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderPpmpLineItemsDto {
  @ApiProperty({
    type: [String],
    description:
      'Every line-item id belonging to this PPMP, in the desired order. Rejected if the set does not exactly match the PPMP’s current line items.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  lineItemIds: string[];
}
