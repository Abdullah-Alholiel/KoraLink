import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * Thin wrapper around the Unifonic SMS REST API.
 * Docs: https://help.unifonic.com/en/sms/sms-api
 */
@Injectable()
export class UnifonicService {
  private readonly appSid: string;
  private readonly senderId: string;

  constructor(private readonly config: ConfigService) {
    this.appSid = config.get<string>('UNIFONIC_APP_SID', '');
    this.senderId = config.get<string>('UNIFONIC_SENDER_ID', 'KoraLink');
  }

  async sendSms(to: string, body: string): Promise<void> {
    if (!this.appSid) {
      // In local/test environments without credentials just log.
      console.warn(`[Unifonic] Skipping SMS to ${to}: "${body}"`);
      return;
    }

    await axios.post(
      'https://el.cloud.unifonic.com/rest/SMS/messages',
      new URLSearchParams({
        AppSid: this.appSid,
        SenderID: this.senderId,
        Body: body,
        Recipient: to,
        responseType: 'JSON',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
  }
}
