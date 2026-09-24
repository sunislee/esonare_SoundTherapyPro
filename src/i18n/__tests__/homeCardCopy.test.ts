/**
 * 【不变式② · 联网终态失败文案不得伪装成「需要网络」】
 *   home_card_transient_error（下载器终态 failed → 卡片 error 态）此前与 home_card_need_network
 *   中文值完全相同(「需要网络 · 点按重试」)——联网时 CDN 重试烧完却告诉用户「需要网络」是假文案。
 *   本测试锁死：两者必须不同，且 transient_error 不得再含「需要网络 / Network needed / ネットワークが必要」。
 */
const zh = require('../locales/zh.json');
const en = require('../locales/en.json');
const ja = require('../locales/ja.json');

describe('home_card 文案不变式②', () => {
  const locales: Array<[string, any]> = [
    ['zh', zh],
    ['en', en],
    ['ja', ja],
  ];

  for (const [name, dict] of locales) {
    it(`${name}: transient_error 与 need_network 文案必须不同`, () => {
      expect(dict.home_card_transient_error).toBeDefined();
      expect(dict.home_card_need_network).toBeDefined();
      expect(dict.home_card_transient_error).not.toBe(dict.home_card_need_network);
    });

    it(`${name}: transient_error(联网终态失败) 不得含「需要网络」语义`, () => {
      const t: string = dict.home_card_transient_error;
      expect(t).not.toMatch(/需要网络/);
      expect(t).not.toMatch(/Network needed/i);
      expect(t).not.toMatch(/ネットワークが必要/);
    });

    it(`${name}: need_network(离线) 仍应表达「需要网络」`, () => {
      const n: string = dict.home_card_need_network;
      expect(n).toMatch(/需要网络|Network needed|ネットワークが必要/);
    });
  }
});