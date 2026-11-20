import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { CommunityGroup, CommunityGroupDetail, CommunityPost, Profile } from '../types';
import { fmtTime } from '../types';
import { containsBadLanguage, BAD_LANGUAGE_WARNING } from '../lib/profanity';
import { HarvestChips, HarvestForm, TrophyCardButton } from './TrophyCardSheet';

const SPECIES = ['Whitetail Deer', 'Mule Deer', 'Elk', 'Turkey', 'Bear', 'Waterfowl', 'Upland Birds', 'Small Game', 'Other'];

function GroupTile({ name, imageUrl, viewing, onClick }: { name: string; imageUrl?: string; viewing: boolean; onClick: () => void }) {
  const initials = name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <button className={`group-tile ${viewing ? 'viewing' : ''}`} onClick={onClick}>
      {imageUrl
        ? <img className="group-tile-img" src={imageUrl} alt={name} />
        : <span className="group-tile-disc">{initials}</span>}
      <span className="group-tile-name">{name}</span>
      {viewing && <span className="group-tile-viewing">Viewing</span>}
    </button>
  );
}

export default function CommunityTab({ profile }: { profile: Profile }) {
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [feedGroupId, setFeedGroupId] = useState<number | null>(() => {
    const v = localStorage.getItem('basecamp-community-group');
    return v ? Number(v) : null;
  });
  const [feedName, setFeedName] = useState('All Community');
  const [panelOpen, setPanelOpen] = useState(false);
  const [view, setView] = useState<'feed' | 'leaderboard'>(() => (localStorage.getItem('basecamp-community-view') as 'feed' | 'leaderboard') || 'feed');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [groupDetail, setGroupDetail] = useState<CommunityGroupDetail | null>(null);
  const [groupSearch, setGroupSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newState, setNewState] = useState('');
  const [newAbout, setNewAbout] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [editName, setEditName] = useState('');
  const [editState, setEditState] = useState('');
  const [editAbout, setEditAbout] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [species, setSpecies] = useState('Whitetail Deer');
  const [caption, setCaption] = useState('');
  const [photoData, setPhotoData] = useState('');
  const [harvest, setHarvest] = useState<{ harvestClass: string; weightLbs: number | null; antlerScore: number | null; antlerPoints: number | null }>({ harvestClass: '', weightLbs: null, antlerScore: null, antlerPoints: null });
  const [showHarvest, setShowHarvest] = useState(false);
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [busy, setBusy] = useState(false);
  const [fullPhoto, setFullPhoto] = useState<CommunityPost | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const myName = profile.displayName || 'Hunter';

  const loadGroups = useCallback(async () => {
    try { setGroups(await api.listGroups()); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load groups.'); }
  }, []);
  const loadPosts = useCallback(async (gid: number | null) => {
    try { setPosts(await api.listCommunityPosts(gid)); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load the feed.'); }
  }, []);
  useEffect(() => { (async () => { setLoading(true); await loadGroups(); await loadPosts(feedGroupId); setLoading(false); })(); }, [loadGroups, loadPosts, feedGroupId]);
  useEffect(() => {
    if (feedGroupId) api.getGroup(feedGroupId).then(g => { setGroupDetail(g); setFeedName(g.name); }).catch(() => setGroupDetail(null));
    else { setGroupDetail(null); setFeedName('All Community'); }
  }, [feedGroupId]);
  useEffect(() => { localStorage.setItem('basecamp-community-view', view); }, [view]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setPanelOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function openFeed(gid: number | null, name: string) {
    setFeedGroupId(gid);
    setFeedName(name);
    localStorage.setItem('basecamp-community-group', gid ? String(gid) : '');
    setPanelOpen(false);
    setShowSettings(false);
  }
  const badCaption = containsBadLanguage(caption);
  const badGroup = containsBadLanguage(newName) || containsBadLanguage(newAbout);

  async function createGroup() {
    if (!newName.trim()) { setErr('Group name is required.'); return; }
    setBusy(true); setErr('');
    try {
      const g = await api.createGroup({ name: newName.trim(), state: newState.trim() || undefined, description: newAbout.trim() || undefined });
      setNewName(''); setNewState(''); setNewAbout(''); setShowCreate(false);
      await loadGroups();
      openFeed(g.id, g.name);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not create group.'); }
    finally { setBusy(false); }
  }
  async function saveGroupSettings() {
    if (!groupDetail) return;
    setBusy(true); setErr('');
    try {
      await api.updateGroup(groupDetail.id, { name: editName.trim(), state: editState, description: editAbout });
      setShowSettings(false);
      await loadGroups();
      const g = await api.getGroup(groupDetail.id);
      setGroupDetail(g); setFeedName(g.name);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save group settings.'); }
    finally { setBusy(false); }
  }
  async function postTrophy() {
    if (!photoData) { setErr('Choose a photo first.'); return; }
    setBusy(true); setErr('');
    try {
      await api.postCommunity({ groupId: feedGroupId, species, caption: caption.trim(), imageUrl: photoData, ...harvest });
      setPhotoData(''); setCaption(''); setHarvest({ harvestClass: '', weightLbs: null, antlerScore: null, antlerPoints: null }); setShowHarvest(false);
      await loadPosts(feedGroupId);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not post.'); }
    finally { setBusy(false); }
  }

  const visibleGroups = groups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()));
  const feedLabel = feedGroupId ? feedName : 'All Community';

  return (
    <div className="content">
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn" onClick={() => setPanelOpen(true)}>
          Groups ({groups.length}){feedGroupId ? ` · ${feedName}` : ''}
        </button>
        <div className="subtabs grow">
          <button className={view === 'feed' ? 'on' : ''} onClick={() => setView('feed')}>{feedLabel}</button>
          <button className={view === 'leaderboard' ? 'on' : ''} onClick={() => setView('leaderboard')}>Leaderboard</button>
        </div>
      </div>
      {err && <p className="err">{err}</p>}
      {loading && <p>Loading Community…</p>}

      {view === 'feed' && !loading && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{feedLabel}</h2>
          <label>Species</label>
          <select value={species} onChange={e => setSpecies(e.target.value)}>{SPECIES.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <label>Your comment</label>
          <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Tell the story of this harvest…" />
          {badCaption && <p className="err">{BAD_LANGUAGE_WARNING}</p>}
          <div className="row" style={{ marginTop: 8 }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
              const f = e.target.files?.[0]; if (!f) return;
              const reader = new FileReader();
              reader.onload = () => setPhotoData(String(reader.result));
              reader.readAsDataURL(f);
            }} />
            <button className="btn grow" onClick={() => fileRef.current?.click()}>{photoData ? 'Photo ready ✓ — tap to change' : 'Choose a photo'}</button>
            <button className="btn" onClick={() => setShowHarvest(v => !v)}>Harvest details</button>
          </div>
          {showHarvest && (
            <HarvestForm initial={harvest} onSave={v => { setHarvest(v); setShowHarvest(false); }} onCancel={() => setShowHarvest(false)} />
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary grow" disabled={!photoData || badCaption || !caption.trim() || busy} onClick={postTrophy}>Post trophy</button>
          </div>
          {!caption.trim() && <p className="small">Add a comment to post your trophy.</p>}
          {posts.length === 0 && <p className="muted" style={{ marginTop: 10 }}>No trophy posts in this feed yet.</p>}
          {posts.map(p => (
            <CommunityPostCard key={p.id} post={p} myName={myName} feedName={feedLabel} onChanged={() => loadPosts(feedGroupId)} onFull={() => setFullPhoto(p)} onEdit={() => setEditingPost(p)} />
          ))}
        </div>
      )}
      {view === 'leaderboard' && <Leaderboard profile={profile} feedGroupId={feedGroupId} />}

      {panelOpen && (
        <>
          <div className="panel-backdrop" onClick={() => setPanelOpen(false)} />
          <div className="groups-panel">
            <div className="row">
              <h3 className="grow" style={{ margin: 0 }}>Groups</h3>
              <button className="btn small" onClick={() => setPanelOpen(false)}>✕</button>
            </div>
            {groups.length > 4 && (
              <div style={{ marginTop: 8 }}>
                <input value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="Search groups…" />
              </div>
            )}
            <div className="group-grid">
              <GroupTile name="All Community" viewing={feedGroupId === null} onClick={() => openFeed(null, 'All Community')} />
              {visibleGroups.map(g => (
                <GroupTile key={g.id} name={g.name} imageUrl={g.imageUrl} viewing={feedGroupId === g.id} onClick={() => openFeed(g.id, g.name)} />
              ))}
            </div>
            {feedGroupId && groupDetail && (
              <div className="card" style={{ marginTop: 10 }}>
                <h3 style={{ marginTop: 0 }}>{groupDetail.name}</h3>
                {groupDetail.description && <p className="muted">{groupDetail.description}</p>}
                <p className="small">{groupDetail.memberCount} member{groupDetail.memberCount === 1 ? '' : 's'}{groupDetail.state ? ` · ${groupDetail.state}` : ''}</p>
                {groupDetail.isCreator && <p className="small">You created this group.</p>}
                {groupDetail.joined ? (
                  <button className="btn small" disabled={groupDetail.isCreator} onClick={async () => { try { await api.leaveGroup(groupDetail.id); await loadGroups(); const g = await api.getGroup(groupDetail.id); setGroupDetail(g); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not leave the group.'); } }}>
                    {groupDetail.isCreator ? 'Creator (cannot leave)' : 'Leave group'}
                  </button>
                ) : (
                  <button className="btn small primary" onClick={async () => { try { await api.joinGroup(groupDetail.id); await loadGroups(); const g = await api.getGroup(groupDetail.id); setGroupDetail(g); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not join the group.'); } }}>Join group</button>
                )}
                {groupDetail.isCreator && (
                  <button className="btn small" style={{ marginLeft: 6 }} onClick={() => { setEditName(groupDetail.name); setEditState(groupDetail.state); setEditAbout(groupDetail.description); setShowSettings(true); }}>Settings</button>
                )}
              </div>
            )}
            {!showCreate && <button className="btn primary grow" style={{ marginTop: 10, width: '100%' }} onClick={() => setShowCreate(true)}>+ Create a group</button>}
            {showCreate && (
              <div className="card" style={{ marginTop: 10 }}>
                <label>Group name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. MD Hunters" />
                <label>Home state (optional)</label>
                <input value={newState} onChange={e => setNewState(e.target.value)} placeholder="e.g. MD" />
                <label>About (optional)</label>
                <textarea value={newAbout} onChange={e => setNewAbout(e.target.value)} placeholder="What is this group about?" />
                {badGroup && <p className="err">{BAD_LANGUAGE_WARNING}</p>}
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn primary grow" disabled={!newName.trim() || badGroup || busy} onClick={createGroup}>Create group</button>
                  <button className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
                </div>
                {!newName.trim() && <p className="small">A group name is required.</p>}
              </div>
            )}
          </div>
        </>
      )}

      {showSettings && groupDetail && (
        <div className="sheet" onClick={() => setShowSettings(false)}>
          <div className="sheet-inner" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Group settings — {groupDetail.name}</h2>
            <label>Group name</label>
            <input value={editName} onChange={e => setEditName(e.target.value)} />
            <label>Home state</label>
            <input value={editState} onChange={e => setEditState(e.target.value)} />
            <label>About</label>
            <textarea value={editAbout} onChange={e => setEditAbout(e.target.value)} />
            <label>Group picture</label>
            <input type="file" accept="image/*" onChange={e => {
              const f = e.target.files?.[0]; if (!f) return;
              const reader = new FileReader();
              reader.onload = async () => {
                try { await api.updateGroup(groupDetail.id, { imageUrl: String(reader.result) }); const g = await api.getGroup(groupDetail.id); setGroupDetail(g); await loadGroups(); } catch (err2) { setErr(err2 instanceof Error ? err2.message : 'Could not set the group picture.'); }
              };
              reader.readAsDataURL(f);
            }} />
            {groupDetail.imageUrl && <button className="btn small" style={{ marginTop: 6 }} onClick={async () => { await api.updateGroup(groupDetail.id, { imageUrl: '' }); const g = await api.getGroup(groupDetail.id); setGroupDetail(g); await loadGroups(); }}>Remove picture</button>}
            <h3>Members ({groupDetail.members.length})</h3>
            {groupDetail.members.map(m => (
              <div key={m.id} className="listrow">
                <span className="grow">{m.userName} {m.isCreator && <span className="pill orange">Creator</span>}</span>
                {!m.isCreator && (
                  confirmRemove === m.id ? (
                    <span className="row">
                      <button className="btn small danger" onClick={async () => { await api.removeGroupMember(groupDetail.id, m.id); setConfirmRemove(null); const g = await api.getGroup(groupDetail.id); setGroupDetail(g); await loadGroups(); }}>Remove for real</button>
                      <button className="btn small" onClick={() => setConfirmRemove(null)}>Keep</button>
                    </span>
                  ) : (
                    <button className="btn small danger" onClick={() => setConfirmRemove(m.id)}>Remove</button>
                  )
                )}
              </div>
            ))}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary grow" disabled={!editName.trim() || busy} onClick={saveGroupSettings}>Save settings</button>
              <button className="btn" onClick={() => setShowSettings(false)}>Close</button>
            </div>
            <div style={{ marginTop: 14, borderTop: '1px solid #fca5a5', paddingTop: 10 }}>
              <h3 style={{ color: '#b91c1c' }}>Danger zone</h3>
              <p className="small">Deleting this group removes the group, its members, and every trophy post, like and comment in it. This cannot be undone.</p>
              {confirmDelete ? (
                <div className="row">
                  <button className="btn danger grow" onClick={async () => { await api.deleteGroup(groupDetail.id); setShowSettings(false); setConfirmDelete(false); await loadGroups(); openFeed(null, 'All Community'); }}>Yes, delete this group</button>
                  <button className="btn" onClick={() => setConfirmDelete(false)}>Keep it</button>
                </div>
              ) : (
                <button className="btn danger" onClick={() => setConfirmDelete(true)}>Delete group</button>
              )}
            </div>
          </div>
        </div>
      )}

      {editingPost && (
        <div className="sheet" onClick={() => setEditingPost(null)}>
          <div className="sheet-inner" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Harvest details</h2>
            <HarvestForm
              initial={editingPost}
              onSave={async v => {
                try { await api.updateCommunityPost(editingPost.id, v); setEditingPost(null); await loadPosts(feedGroupId); }
                catch (e) { setErr(e instanceof Error ? e.message : 'Could not save details.'); }
              }}
              onCancel={() => setEditingPost(null)}
            />
          </div>
        </div>
      )}

      {fullPhoto && (
        <div className="sheet" onClick={() => setFullPhoto(null)}>
          <div className="sheet-inner" onClick={e => e.stopPropagation()}>
            {fullPhoto.imageUrl && !fullPhoto.imageUrl.startsWith('./blobs/')
              ? <img className="feed-img" src={fullPhoto.imageUrl} alt={fullPhoto.caption || fullPhoto.species} />
              : <div className="img-fallback">{fullPhoto.species} — photo needs re-upload</div>}
            <p style={{ marginTop: 10 }}><strong>{fullPhoto.species}</strong> · {fmtTime(fullPhoto.createdAt)}</p>
            {fullPhoto.caption && <p>{fullPhoto.caption}</p>}
            <HarvestChips post={fullPhoto} />
            <div className="row" style={{ marginTop: 10 }}>
              <TrophyCardButton photo={fullPhoto} place={feedLabel} />
              <button className="btn" onClick={() => setFullPhoto(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CommunityPostCard({ post, myName, feedName, onChanged, onFull, onEdit }: {
  post: CommunityPost; myName: string; feedName: string; onChanged: () => void; onFull: () => void; onEdit: () => void;
}) {
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');
  const badComment = containsBadLanguage(comment);
  const isMine = post.authorName === myName;
  return (
    <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginTop: 12 }}>
      <p><span className="small">{fmtTime(post.createdAt)}</span> · <span className="pill">{post.species}</span></p>
      <div className="feed-img-wrap" onClick={onFull} style={{ cursor: 'pointer' }}>
        {post.imageUrl && !post.imageUrl.startsWith('./blobs/') ? (
          <img className="feed-img" src={post.imageUrl} alt={post.caption || post.species} />
        ) : (
          <div className="img-fallback">{post.species} — photo needs re-upload</div>
        )}
      </div>
      {post.caption && <p style={{ margin: '8px 0 4px' }}>{post.caption}</p>}
      <HarvestChips post={post} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className={`btn small ${post.liked ? 'selected' : ''}`} onClick={async () => { try { await api.toggleCommunityLike(post.id); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not like.'); } }}>
          {post.liked ? '♥ Liked' : '♡ Like'} ({post.likeCount})
        </button>
        <TrophyCardButton photo={post} place={feedName} />
        {isMine && <button className="btn small" onClick={onEdit}>Add harvest details</button>}
        {isMine && <button className="btn small danger" onClick={async () => { if (window.confirm('Delete this post?')) { try { await api.deleteCommunityPost(post.id); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not delete.'); } } }}>Delete</button>}
      </div>
      {err && <p className="err">{err}</p>}
      {post.comments.map(c => <p key={c.id} className="small" style={{ margin: '6px 0' }}>{c.body}</p>)}
      <div className="row" style={{ marginTop: 6 }}>
        <input className="grow" value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment…" />
        <button className="btn small" disabled={!comment.trim() || badComment} onClick={async () => { try { await api.addCommunityComment(post.id, comment.trim()); setComment(''); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not comment.'); } }}>Post</button>
      </div>
      {badComment && <p className="err">{BAD_LANGUAGE_WARNING}</p>}
    </div>
  );
}

function Leaderboard({ profile, feedGroupId }: { profile: Profile; feedGroupId: number | null }) {
  const [scope, setScope] = useState('everyone');
  const [state, setState] = useState('');
  const [season, setSeason] = useState('all');
  const [data, setData] = useState<{ entries: { name: string; score: number; posts: number; species: string[]; biggestBuck: number | null; heaviestLbs: number | null }[]; yourStanding: { rank: number; score: number; posts: number } | null; biggestBucks: { hunter: string; antlerScore: number | null; antlerPoints: number | null; species: string }[]; seasonLabel: string } | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.getLeaderboard({ scope, state: scope === 'state' ? state : undefined, groupId: scope === 'group' ? feedGroupId : undefined, season })
      .then(d => { setData(d); setErr(''); })
      .catch(e => setErr(e instanceof Error ? e.message : 'Could not load the leaderboard.'))
      .finally(() => setLoading(false));
  }, [scope, state, season, feedGroupId]);
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Leaderboard</h2>
      <div className="row-wrap">
        {(['everyone', 'area', 'state', 'group'] as const).map(s => (
          <button key={s} className={`chip ${scope === s ? 'on' : ''}`} onClick={() => setScope(s)}>
            {s === 'everyone' ? 'Everyone' : s === 'area' ? 'My area' : s === 'state' ? 'Pick a state' : 'By group'}
          </button>
        ))}
        {scope === 'state' && (
          <select value={state} onChange={e => setState(e.target.value)} style={{ width: 90 }}>
            <option value="">State</option>
            {['MD', 'VA', 'PA', 'DE', 'WV', 'OH', 'NY', 'NC', 'SC', 'GA', 'TN', 'KY'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <button className={`chip ${season === 'all' ? 'on' : ''}`} onClick={() => setSeason('all')}>All time</button>
        <button className={`chip ${season === 'season' ? 'on' : ''}`} onClick={() => setSeason('season')}>This season</button>
      </div>
      <p className="small">Showing: {data?.seasonLabel ?? 'All time'}{scope === 'area' ? ` · ${profile.huntingState || 'your state'}` : ''}</p>
      {loading && <p>Loading leaderboard…</p>}
      {err && <p className="err">{err}</p>}
      {data?.yourStanding && (
        <div className="card" style={{ background: '#eef2ee', marginTop: 8 }}>
          <strong>Your standing</strong>
          <p style={{ margin: '4px 0 0' }}>Rank #{data.yourStanding.rank} · {data.yourStanding.score} points · {data.yourStanding.posts} trophy post{data.yourStanding.posts === 1 ? '' : 's'}</p>
        </div>
      )}
      {data && data.entries.length === 0 && <p className="muted">No trophy posts yet — the leaderboard fills in as hunters post.</p>}
      {data?.entries.map((e, i) => (
        <div key={e.name} className="listrow">
          <span style={{ width: 28, fontWeight: 800 }}>#{i + 1}</span>
          <span className="grow"><strong>{e.name}</strong><br /><span className="small">{e.posts} post{e.posts === 1 ? '' : 's'} · {e.species.length} species</span></span>
          <strong>{e.score}</strong>
        </div>
      ))}
      {data && data.biggestBucks.length > 0 && (
        <>
          <h3>Biggest Bucks</h3>
          {data.biggestBucks.map((b, i) => (
            <div key={i} className="listrow">
              <span className="grow"><strong>{b.hunter}</strong><br /><span className="small">{b.species}</span></span>
              <strong>{b.antlerScore}"{b.antlerPoints ? ` · ${b.antlerPoints} pts` : ''}</strong>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
