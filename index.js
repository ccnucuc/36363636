require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const { Kazagumo, Payload, KazagumoTrack } = require('kazagumo');
const { Connectors } = require('shoukaku');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const kazagumo = new Kazagumo(
    {
        defaultSearchEngine: 'youtube_music',
        send: (guildId, payload) => {
            const guild = client.guilds.cache.get(guildId);
            if (guild) guild.shard.send(payload);
        },
    },
    new Connectors.DiscordJS(client),
    [
        {
            name: 'Node1',
            url: `${process.env.LAVALINK_HOST || 'node2.zencheap.net'}:${process.env.LAVALINK_PORT || 30087}`,
            auth: process.env.LAVALINK_PASS || 'LeThaiAn',
            secure: false,
        }
    ]
);

function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
        : `${m}:${String(sec).padStart(2,'0')}`;
}

kazagumo.shoukaku.on('ready', (name) => console.log(`✅ Lavalink node "${name}" đã kết nối!`));
kazagumo.shoukaku.on('error', (name, error) => console.error(`❌ Node "${name}" lỗi:`, error.message));
kazagumo.shoukaku.on('close', (name, code, reason) => console.warn(`⚠️ Node "${name}" đóng: ${code} ${reason}`));
kazagumo.shoukaku.on('disconnect', (name) => console.warn(`⚠️ Node "${name}" ngắt kết nối`));

kazagumo.on('playerStart', (player, track) => {
    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;
    const embed = new EmbedBuilder()
        .setColor(0x1DB954)
        .setTitle('🎵 Đang phát')
        .setDescription(`**[${track.title}](${track.uri})**`)
        .addFields(
            { name: 'Thời lượng', value: track.isStream ? 'Live' : formatDuration(track.length), inline: true },
            { name: 'Tác giả', value: track.author || 'N/A', inline: true },
            { name: 'Yêu cầu bởi', value: track.requester?.tag || 'N/A', inline: true }
        )
        .setThumbnail(track.thumbnail || null);
    channel.send({ embeds: [embed] });
});

kazagumo.on('playerEnd', (player) => {
    if (player.queue.length === 0) {
        const channel = client.channels.cache.get(player.textId);
        channel?.send('👋 Hết nhạc trong hàng đợi!');
    }
});

kazagumo.on('playerEmpty', (player) => {
    const channel = client.channels.cache.get(player.textId);
    channel?.send('👋 Hết nhạc trong hàng đợi!');
    player.destroy();
});

kazagumo.on('playerError', (player, track, error) => {
    const channel = client.channels.cache.get(player.textId);
    console.error('Player error:', error);
    channel?.send(`❌ Lỗi khi phát: **${track?.title || 'Unknown'}**`);
});

const PREFIX = process.env.PREFIX || '>';

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const voiceChannel = message.member?.voice?.channel;

    try {
        // PLAY
        if (command === 'play' || command === 'p') {
            const query = args.join(' ');
            if (!query) return message.reply('❌ Nhập tên bài hát hoặc URL!');
            if (!voiceChannel) return message.reply('❌ Bạn cần vào kênh voice trước!');

            await message.reply('🔍 Đang tìm kiếm...');

            let player = kazagumo.players.get(message.guild.id);
            if (!player) {
                player = await kazagumo.createPlayer({
                    guildId: message.guild.id,
                    textId: message.channel.id,
                    voiceId: voiceChannel.id,
                    deaf: true,
                    volume: 100,
                });
            }

            const result = await kazagumo.search(query, { requester: message.author });
            if (!result || !result.tracks.length) return message.channel.send('❌ Không tìm thấy bài hát!');

            if (result.type === 'PLAYLIST') {
                for (const track of result.tracks) player.queue.add(track);
                message.channel.send(`✅ Đã thêm playlist **${result.playlistName}** (${result.tracks.length} bài)`);
            } else {
                player.queue.add(result.tracks[0]);
                if (player.playing || player.paused) {
                    message.channel.send(`✅ Đã thêm vào hàng đợi: **${result.tracks[0].title}**`);
                }
            }

            if (!player.playing && !player.paused) await player.play();
        }

        // SOUNDCLOUD
        else if (command === 'sc') {
            const query = args.join(' ');
            if (!query) return message.reply('❌ Nhập tên bài hát SoundCloud!');
            if (!voiceChannel) return message.reply('❌ Bạn cần vào kênh voice trước!');

            await message.reply('🔍 Đang tìm kiếm trên SoundCloud...');

            let player = kazagumo.players.get(message.guild.id);
            if (!player) {
                player = await kazagumo.createPlayer({
                    guildId: message.guild.id,
                    textId: message.channel.id,
                    voiceId: voiceChannel.id,
                    deaf: true,
                    volume: 100,
                });
            }

            const result = await kazagumo.search(query, { requester: message.author, engine: 'soundcloud' });
            if (!result || !result.tracks.length) return message.channel.send('❌ Không tìm thấy bài hát trên SoundCloud!');

            player.queue.add(result.tracks[0]);
            if (player.playing || player.paused) {
                message.channel.send(`✅ Đã thêm vào hàng đợi: **${result.tracks[0].title}**`);
            }
            if (!player.playing && !player.paused) await player.play();
        }

        // PAUSE
        else if (command === 'pause') {
            const player = kazagumo.players.get(message.guild.id);
            if (!player) return message.reply('❌ Không có nhạc đang phát.');
            if (player.paused) return message.reply('⏸ Nhạc đã tạm dừng rồi.');
            await player.pause(true);
            message.reply('⏸ Đã tạm dừng.');
        }

        // RESUME
        else if (command === 'resume' || command === 'r') {
            const player = kazagumo.players.get(message.guild.id);
            if (!player) return message.reply('❌ Không có nhạc.');
            if (!player.paused) return message.reply('▶️ Nhạc đang phát rồi.');
            await player.pause(false);
            message.reply('▶️ Tiếp tục phát.');
        }

        // SKIP
        else if (command === 'skip' || command === 's') {
            const player = kazagumo.players.get(message.guild.id);
            if (!player) return message.reply('❌ Không có nhạc đang phát.');
            await player.skip();
            message.reply('⏭ Đã bỏ qua.');
        }

        // STOP
        else if (command === 'stop') {
            const player = kazagumo.players.get(message.guild.id);
            if (!player) return message.reply('❌ Bot không ở trong kênh voice.');
            await player.destroy();
            message.reply('⏹ Đã dừng và rời kênh voice.');
        }

        // QUEUE
        else if (command === 'queue' || command === 'q') {
            const player = kazagumo.players.get(message.guild.id);
            if (!player || !player.queue.current) return message.reply('❌ Không có nhạc trong hàng đợi.');
            const songs = player.queue.slice(0, 10);
            const embed = new EmbedBuilder()
                .setColor(0x1DB954)
                .setTitle('📋 Hàng đợi nhạc')
                .setDescription(
                    `**Đang phát:** ${player.queue.current.title}\n\n` +
                    (songs.length ? songs.map((s, i) => `**${i+1}.** ${s.title}`).join('\n') : 'Không có bài tiếp theo.')
                )
                .setFooter({ text: `Tổng: ${player.queue.length + 1} bài` });
            message.reply({ embeds: [embed] });
        }

        // NOW PLAYING
        else if (command === 'np' || command === 'nowplaying') {
            const player = kazagumo.players.get(message.guild.id);
            if (!player || !player.queue.current) return message.reply('❌ Không có nhạc đang phát.');
            const track = player.queue.current;
            const embed = new EmbedBuilder()
                .setColor(0x1DB954)
                .setTitle('🎵 Đang phát')
                .setDescription(`**[${track.title}](${track.uri})**`)
                .addFields(
                    { name: 'Thời lượng', value: track.isStream ? 'Live' : formatDuration(track.length), inline: true },
                    { name: 'Tiến trình', value: `${formatDuration(player.position)} / ${formatDuration(track.length)}`, inline: true },
                    { name: 'Tác giả', value: track.author || 'N/A', inline: true }
                )
                .setThumbnail(track.thumbnail || null);
            message.reply({ embeds: [embed] });
        }

        // VOLUME
        else if (command === 'volume' || command === 'vol') {
            const player = kazagumo.players.get(message.guild.id);
            if (!player) return message.reply('❌ Không có nhạc đang phát.');
            const vol = parseInt(args[0]);
            if (isNaN(vol) || vol < 0 || vol > 200) return message.reply('❌ Âm lượng hợp lệ: 0–200.');
            await player.setVolume(vol);
            message.reply(`🔊 Âm lượng: **${vol}%**`);
        }

        // LOOP
        else if (command === 'loop') {
            const player = kazagumo.players.get(message.guild.id);
            if (!player) return message.reply('❌ Không có nhạc.');
            const modes = ['none', 'track', 'queue'];
            const next = modes[(modes.indexOf(player.loop) + 1) % 3];
            player.setLoop(next);
            const labels = { none: '❌ Tắt', track: '🔂 Lặp bài', queue: '🔁 Lặp queue' };
            message.reply(`Loop: **${labels[next]}**`);
        }

        // SHUFFLE
        else if (command === 'shuffle') {
            const player = kazagumo.players.get(message.guild.id);
            if (!player || player.queue.length === 0) return message.reply('❌ Không có nhạc trong hàng đợi.');
            player.queue.shuffle();
            message.reply('🔀 Đã xáo trộn hàng đợi!');
        }

        // HELP
        else if (command === 'help') {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🎶 Inferno Music - Lệnh')
                .setDescription(`Prefix: \`${PREFIX}\``)
                .addFields(
                    { name: `\`${PREFIX}play <tên/url>\``, value: 'Phát nhạc YouTube hoặc URL' },
                    { name: `\`${PREFIX}sc <tên>\``, value: 'Tìm và phát nhạc SoundCloud' },
                    { name: `\`${PREFIX}pause\` / \`${PREFIX}resume\``, value: 'Tạm dừng / Tiếp tục' },
                    { name: `\`${PREFIX}skip\``, value: 'Bỏ qua bài hiện tại' },
                    { name: `\`${PREFIX}stop\``, value: 'Dừng và rời kênh voice' },
                    { name: `\`${PREFIX}queue\``, value: 'Xem hàng đợi' },
                    { name: `\`${PREFIX}np\``, value: 'Xem bài đang phát' },
                    { name: `\`${PREFIX}volume <0-200>\``, value: 'Điều chỉnh âm lượng' },
                    { name: `\`${PREFIX}loop\``, value: 'Lặp bài / queue / tắt' },
                    { name: `\`${PREFIX}shuffle\``, value: 'Xáo trộn hàng đợi' },
                );
            message.reply({ embeds: [embed] });
        }

    } catch (e) {
        console.error(e);
        message.reply(`❌ Có lỗi: ${e.message?.slice(0, 100) || 'Không xác định'}`);
    }
});

client.once('ready', () => {
    console.log(`✅ Bot đã online: ${client.user.tag}`);
    client.user.setActivity(`${PREFIX}help`, { type: ActivityType.Listening });
});

client.login(process.env.DISCORD_TOKEN);
