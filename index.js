require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { LavalinkManager } = require('lavalink-client');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const lavalink = new LavalinkManager({
    nodes: [
        {
            id: "node1",
            host: "lavalink.jirayu.net",
            port: 13592,
            authorization: "youshallnotpass",
            secure: false
        },
        {
            id: "node2",
            host: "lavalink.devamop.in",
            port: 443,
            authorization: "DevamOP",
            secure: true
        }
    ],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard.send(payload),
    client: {
        id: process.env.CLIENT_ID,
        username: "MusicBot"
    }
});

// Lavalink events
lavalink.on("trackStart", (player, track) => {
    const channel = client.channels.cache.get(player.textChannelId);
    if (!channel) return;
    const embed = new EmbedBuilder()
        .setColor(0x1DB954)
        .setTitle("🎵 Đang phát nhạc")
        .setDescription(`**[${track.info.title}](${track.info.uri})**`)
        .addFields(
            { name: "Tác giả", value: track.info.author || "Không rõ", inline: true },
            { name: "Thời lượng", value: formatDuration(track.info.duration), inline: true }
        )
        .setThumbnail(track.info.artworkUrl || null);
    channel.send({ embeds: [embed] });
});

lavalink.on("queueEnd", (player) => {
    const channel = client.channels.cache.get(player.textChannelId);
    // Nếu không bật 24/7 thì rời voice sau 30 giây
    if (!player.get('247')) {
        setTimeout(() => {
            if (!player.playing && !player.paused) {
                player.destroy();
                channel?.send("👋 Không còn nhạc trong hàng đợi, đã rời kênh voice.");
            }
        }, 30000);
    }
});

// Helper: định dạng thời lượng
function formatDuration(ms) {
    if (!ms) return "Live";
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
}

// Helper: lấy hoặc tạo player
async function getOrCreatePlayer(message) {
    if (!message.member?.voice?.channel) {
        message.reply("❌ Bạn cần vào phòng voice trước!");
        return null;
    }
    let player = lavalink.getPlayer(message.guild.id);
    if (!player) {
        player = lavalink.createPlayer({
            guildId: message.guild.id,
            voiceChannelId: message.member.voice.channel.id,
            textChannelId: message.channel.id,
            selfDeaf: true,
            selfMute: false,
            volume: 80,
        });
    }
    if (!player.connected) await player.connect();
    return player;
}

// Prefix lệnh
const PREFIX = process.env.PREFIX || '>';

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        // --- PLAY ---
        if (command === 'play' || command === 'p') {
            const query = args.join(' ');
            if (!query) return message.reply("❌ Vui lòng nhập tên bài hát hoặc URL!");

            const player = await getOrCreatePlayer(message);
            if (!player) return;

            const res = await player.search(
                { query, source: query.startsWith('http') ? undefined : "ytsearch" },
                message.author
            );

            if (!res || !res.tracks.length) {
                return message.reply("❌ Không tìm thấy bài hát nào!");
            }

            // Nếu là playlist
            if (res.loadType === 'playlist') {
                for (const track of res.tracks) player.queue.add(track);
                message.reply(`✅ Đã thêm playlist **${res.playlist?.name}** (${res.tracks.length} bài) vào hàng đợi.`);
            } else {
                player.queue.add(res.tracks[0]);
                if (player.playing || player.paused) {
                    message.reply(`✅ Đã thêm vào hàng đợi: **${res.tracks[0].info.title}**`);
                }
            }

            if (!player.playing && !player.paused) await player.play();
        }

        // --- PAUSE / RESUME ---
        else if (command === 'pause') {
            const player = lavalink.getPlayer(message.guild.id);
            if (!player?.playing) return message.reply("❌ Hiện không có nhạc đang phát.");
            await player.pause(true);
            message.reply("⏸ Đã tạm dừng.");
        }

        else if (command === 'resume' || command === 'r') {
            const player = lavalink.getPlayer(message.guild.id);
            if (!player?.paused) return message.reply("❌ Bot không đang tạm dừng.");
            await player.pause(false);
            message.reply("▶️ Tiếp tục phát nhạc.");
        }

        // --- SKIP ---
        else if (command === 'skip' || command === 's') {
            const player = lavalink.getPlayer(message.guild.id);
            if (!player?.playing) return message.reply("❌ Không có nhạc đang phát.");
            await player.skip();
            message.reply("⏭ Đã bỏ qua bài hiện tại.");
        }

        // --- STOP ---
        else if (command === 'stop') {
            const player = lavalink.getPlayer(message.guild.id);
            if (!player) return message.reply("❌ Bot không ở trong kênh voice.");
            await player.destroy();
            message.reply("⏹ Đã dừng phát và rời kênh voice.");
        }

        // --- QUEUE ---
        else if (command === 'queue' || command === 'q') {
            const player = lavalink.getPlayer(message.guild.id);
            if (!player || !player.queue.current) return message.reply("❌ Không có nhạc trong hàng đợi.");

            const upcoming = player.queue.tracks.slice(0, 10);
            const embed = new EmbedBuilder()
                .setColor(0x1DB954)
                .setTitle("📋 Hàng đợi nhạc")
                .setDescription(
                    `**Đang phát:** ${player.queue.current.info.title}\n\n` +
                    (upcoming.length
                        ? upcoming.map((t, i) => `**${i + 1}.** ${t.info.title}`).join('\n')
                        : "Không có bài nào tiếp theo.")
                )
                .setFooter({ text: `Tổng: ${player.queue.tracks.length} bài chờ` });
            message.reply({ embeds: [embed] });
        }

        // --- VOLUME ---
        else if (command === 'volume' || command === 'vol') {
            const player = lavalink.getPlayer(message.guild.id);
            if (!player) return message.reply("❌ Bot không ở trong kênh voice.");
            const vol = parseInt(args[0]);
            if (isNaN(vol) || vol < 0 || vol > 200) return message.reply("❌ Âm lượng hợp lệ: 0–200.");
            await player.setVolume(vol);
            message.reply(`🔊 Đã đặt âm lượng: **${vol}%**`);
        }

        // --- LOOP ---
        else if (command === 'loop') {
            const player = lavalink.getPlayer(message.guild.id);
            if (!player) return message.reply("❌ Bot không ở trong kênh voice.");
            const modes = ['off', 'track', 'queue'];
            const current = player.repeatMode || 'off';
            const next = modes[(modes.indexOf(current) + 1) % modes.length];
            await player.setRepeatMode(next);
            const labels = { off: '❌ Tắt', track: '🔂 Lặp bài', queue: '🔁 Lặp queue' };
            message.reply(`Loop: **${labels[next]}**`);
        }

        // --- 24/7 ---
        else if (command === '24/7') {
            const player = lavalink.getPlayer(message.guild.id);
            if (!player) return message.reply("❌ Bot không ở trong kênh voice.");
            const is247 = !player.get('247');
            player.set('247', is247);
            message.reply(`🔄 Chế độ 24/7: **${is247 ? 'BẬT' : 'TẮT'}**`);
        }

        // --- NOW PLAYING ---
        else if (command === 'np' || command === 'nowplaying') {
            const player = lavalink.getPlayer(message.guild.id);
            if (!player?.queue.current) return message.reply("❌ Không có nhạc đang phát.");
            const track = player.queue.current;
            const pos = formatDuration(player.position);
            const dur = formatDuration(track.info.duration);
            const embed = new EmbedBuilder()
                .setColor(0x1DB954)
                .setTitle("🎵 Đang phát")
                .setDescription(`**[${track.info.title}](${track.info.uri})**`)
                .addFields(
                    { name: "Tác giả", value: track.info.author || "N/A", inline: true },
                    { name: "Tiến trình", value: `${pos} / ${dur}`, inline: true }
                )
                .setThumbnail(track.info.artworkUrl || null);
            message.reply({ embeds: [embed] });
        }

        // --- HELP ---
        else if (command === 'help') {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("🎶 Music Bot - Danh sách lệnh")
                .setDescription(`Prefix: \`${PREFIX}\``)
                .addFields(
                    { name: `\`${PREFIX}play <tên/url>\``, value: "Phát nhạc hoặc thêm vào hàng đợi" },
                    { name: `\`${PREFIX}pause\` / \`${PREFIX}resume\``, value: "Tạm dừng / Tiếp tục" },
                    { name: `\`${PREFIX}skip\``, value: "Bỏ qua bài hiện tại" },
                    { name: `\`${PREFIX}stop\``, value: "Dừng và rời kênh voice" },
                    { name: `\`${PREFIX}queue\``, value: "Xem hàng đợi nhạc" },
                    { name: `\`${PREFIX}np\``, value: "Xem bài đang phát" },
                    { name: `\`${PREFIX}volume <0-200>\``, value: "Điều chỉnh âm lượng" },
                    { name: `\`${PREFIX}loop\``, value: "Lặp bài / queue / tắt" },
                    { name: `\`${PREFIX}24/7\``, value: "Bật/tắt chế độ 24/7 (không rời voice)" },
                );
            message.reply({ embeds: [embed] });
        }

    } catch (e) {
        console.error(e);
        message.reply("❌ Có lỗi xảy ra! Kiểm tra lại link hoặc server Lavalink.");
    }
});

client.on('raw', (d) => lavalink.sendRawData(d));

client.once('ready', async () => {
    console.log(`✅ Bot đã online: ${client.user.tag}`);
    await lavalink.init({ id: client.user.id, username: client.user.username });
});

client.login(process.env.DISCORD_TOKEN);
