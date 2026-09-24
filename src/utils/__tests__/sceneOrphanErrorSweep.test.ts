// store 经 audioAssets 触达 @dr.pogodin/react-native-fs(原生模块)，本测试只用纯函数与内存 Map，
//   stub 掉 audioAssets 切断 RNFS 链（jest.mock 由 babel 自动 hoist 到 import 之前）。
jest.mock('../../constants/audioAssets', () => ({ AUDIO_MANIFEST: [] }));

/**
 * 孤儿错误清算 · 双账本背离修复的不变式测试。
 *
 * 根因：离线时 prioritizeScene tickScene({status:'error'}) 写进 store，但场景从未进 downloader
 *   statusMap → recoverFailedOnNetworkRestore 够不到 → UI 联网仍显示「需要网络」。
 *
 * 锁死三条不变式：
 *   ① isConnected=true 时，store error 必须在一个自愈周期内被收敛为 ready / reconcile / requeue。
 *   ② isConnected=false（断网）时绝不清算，避免误清离线诚实态。
 *   ③ 引擎在途(已入队)的场景只能被 'reconcile'（对齐 store），绝不可被再次入队（防重复下载/队列抖动）。
 */
import {
  planOrphanErrorSweep,
  getErrorSceneIds,
  tickScene,
  _resetForTest,
} from '../SceneDownloadStore';

describe('planOrphanErrorSweep · 孤儿 error 三分支收敛（不变式①）', () => {
  test('store=error + 联网 + 未就绪 + 不在队列 → requeue（离开错误态变 pending/正在下载）', () => {
    const actions = planOrphanErrorSweep(['orphan_x'], {
      isConnected: true,
      isResourceReady: () => false,
      isInQueue: () => false,
    });
    expect(actions).toEqual([{ sceneId: 'orphan_x', action: 'requeue' }]);
  });

  test('store=error + 联网 + 磁盘已就绪 → ready（直接翻绿）', () => {
    const actions = planOrphanErrorSweep(['orphan_y'], {
      isConnected: true,
      isResourceReady: () => true,
      isInQueue: () => false,
    });
    expect(actions).toEqual([{ sceneId: 'orphan_y', action: 'ready' }]);
  });

  test('store=error + 联网 + 未就绪 + 已在队列 → reconcile（对齐引擎真相为下载中，绝不重复入队）', () => {
    const actions = planOrphanErrorSweep(['inflight_z'], {
      isConnected: true,
      isResourceReady: () => false,
      isInQueue: () => true,
    });
    expect(actions).toEqual([{ sceneId: 'inflight_z', action: 'reconcile' }]);
  });

  test('混合账本：就绪→ready、未入队→requeue、在途→reconcile', () => {
    const actions = planOrphanErrorSweep(['a_ready', 'b_requeue', 'c_inflight'], {
      isConnected: true,
      isResourceReady: (id) => id === 'a_ready',
      isInQueue: (id) => id === 'c_inflight',
    });
    expect(actions).toEqual([
      { sceneId: 'a_ready', action: 'ready' },
      { sceneId: 'b_requeue', action: 'requeue' },
      { sceneId: 'c_inflight', action: 'reconcile' },
    ]);
  });

  test('【不变式① 强形式】联网时每个 error 场景都必须拿到一个动作——不存在"留在 error"的分支', () => {
    const ids = ['s1', 's2', 's3', 's4'];
    const actions = planOrphanErrorSweep(ids, {
      isConnected: true,
      isResourceReady: (id) => id === 's1' || id === 's4',
      isInQueue: (id) => id === 's2' || id === 's4',
    });
    expect(actions.map((a) => a.sceneId).sort()).toEqual([...ids].sort());
    // 磁盘就绪优先于在途：s4 既就绪又在队 → ready（可播是唯一真相）
    expect(actions.find((a) => a.sceneId === 's4')?.action).toBe('ready');
  });

  test('【不变式③】在途场景永不被 requeue（防止重复入队把进行中的下载搅成队列抖动）', () => {
    const actions = planOrphanErrorSweep(['inflight_a', 'inflight_b'], {
      isConnected: true,
      isResourceReady: () => false,
      isInQueue: () => true,
    });
    expect(actions.every((a) => a.action === 'reconcile')).toBe(true);
  });
});

describe('planOrphanErrorSweep · 断网绝不误清（不变式②）', () => {
  test('isConnected=false → 任何 error 都不清算（保留离线诚实态，交给真正的 NETWORK_RECOVERED）', () => {
    const actions = planOrphanErrorSweep(['a', 'b'], {
      isConnected: false,
      isResourceReady: () => true, // 即便磁盘就绪也不在断网时强翻
      isInQueue: () => false,
    });
    expect(actions).toEqual([]);
  });
});

describe('getErrorSceneIds · 真实 store 账本暴露孤儿 error', () => {
  beforeEach(() => _resetForTest());

  test('tickScene(error) 的场景可被 getErrorSceneIds 取到，ready 场景不在内', () => {
    tickScene('err_a', { progress: 0, status: 'error' });
    tickScene('err_b', { progress: 0, status: 'error' });
    tickScene('ok_c', { progress: 100, status: 'ready' });
    const ids = getErrorSceneIds().sort();
    expect(ids).toEqual(['err_a', 'err_b']);
  });

  test('清算闭环：模拟 downloader 账本空 → plan 给出 requeue，使孤儿必离开 error 态', () => {
    tickScene('orphan', { progress: 0, status: 'error' });
    const errorIds = getErrorSceneIds();
    expect(errorIds).toContain('orphan');
    const actions = planOrphanErrorSweep(errorIds, {
      isConnected: true,
      isResourceReady: () => false, // downloader/磁盘账本空
      isInQueue: () => false,
    });
    expect(actions.find((a) => a.sceneId === 'orphan')?.action).toBe('requeue');
  });
});
