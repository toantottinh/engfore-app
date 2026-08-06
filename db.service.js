import { supabase } from './supabase-client.js';

export const dbService = {
    /**
     * Tạo một bộ từ vựng mới cho người dùng hiện tại.
     * @param {string} name - Tên của bộ từ vựng.
     * @param {string} userId - ID của người dùng.
     * @returns {Promise<{ data: any, error: Error | null }>}
     */
    createVocabularySet: async (name, userId) => {
        if (!name || !userId) {
            return { data: null, error: new Error('Set name and user ID are required.') };
        }

        const { data, error } = await supabase
            .from('vocabulary_sets')
            .insert([{ name, user_id: userId }])
            .select();

        return { data, error };
    },

    /**
     * Lấy tất cả các bộ từ vựng của một người dùng.
     * @param {string} userId - ID của người dùng.
     * @param {object} [options={}] - Tùy chọn sắp xếp.
     * @returns {Promise<{ data: any[], error: Error | null }>}
     */
    getVocabularySets: async (userId, options = {}) => {
        if (!userId) {
            return { data: null, error: new Error('User ID is required.') };
        }
        const { sortBy = 'created_at', ascending = false } = options;

        const { data, error } = await supabase
            .from('vocabulary_sets')
            .select('*')
            .eq('user_id', userId)
            .order(sortBy, { ascending });

        return { data, error };
    },

    /**
     * Tìm kiếm các bộ từ vựng của người dùng theo tên.
     * @param {string} userId - ID của người dùng.
     * @param {string} searchTerm - Từ khóa tìm kiếm.
     * @param {object} [options={}] - Tùy chọn sắp xếp.
     * @returns {Promise<{ data: any[], error: Error | null }>}
     */
    searchVocabularySets: async (userId, searchTerm, options = {}) => {
        if (!userId) {
            return { data: null, error: new Error('User ID is required.') };
        }
        const { sortBy = 'created_at', ascending = false } = options;

        const { data, error } = await supabase
            .from('vocabulary_sets')
            .select('*')
            .eq('user_id', userId)
            .ilike('name', `%${searchTerm}%`) // ilike cho tìm kiếm không phân biệt hoa thường
            .order(sortBy, { ascending });

        return { data, error };
    },

    /**
     * Cập nhật tên của một bộ từ vựng.
     * @param {string} setId - ID của bộ từ vựng.
     * @param {string} newName - Tên mới.
     * @returns {Promise<{ data: any, error: Error | null }>}
     */
    updateVocabularySetName: async (setId, newName) => {
        const { data, error } = await supabase
            .from('vocabulary_sets')
            .update({ name: newName })
            .eq('id', setId)
            .select();

        return { data, error };
    },
    /**
     * Xóa một bộ từ vựng.
     * @param {string} setId - ID của bộ từ vựng cần xóa.
     * @returns {Promise<{ error: Error | null }>}
     */
    deleteVocabularySet: async (setId) => {
        const { error } = await supabase
            .from('vocabulary_sets')
            .delete()
            .eq('id', setId);
        return { error };
    },

    /**
     * Lấy thông tin chi tiết của một bộ từ vựng bằng ID.
     * @param {string} setId - ID của bộ từ vựng.
     * @returns {Promise<{ data: any, error: Error | null }>}
     */
    getVocabularySetById: async (setId) => {
        const { data, error } = await supabase
            .from('vocabulary_sets')
            .select('*')
            .eq('id', setId)
            .single(); // .single() để trả về một object thay vì một array

        return { data, error };
    },

    /**
     * Import một danh sách từ vào một bộ từ vựng.
     * Sử dụng RPC để gọi một function trong database.
     * @param {string} setId - ID của bộ từ vựng.
     * @param {Array<object>} words - Mảng các đối tượng từ.
     * @returns {Promise<{ data: any, error: Error | null }>}
     */
    importWordsToSet: async (setId, words) => {
        const { data, error } = await supabase.rpc('import_words_to_set', {
            p_set_id: setId,
            p_words_data: words
        });
        return { data, error };
    },

    /**
     * Lấy tất cả các từ trong một bộ từ vựng.
     * @param {string} setId - ID của bộ từ vựng.
     * @returns {Promise<{ data: any[], error: Error | null }>}
     */
    getWordsInSet: async (setId) => {
        const { data, error } = await supabase
            .from('set_words')
            .select(`
                word_senses (
                    id,
                    word_type,
                    meaning,
                    description,
                    example,
                    words (
                        word,
                        ipa
                    )
                )
            `)
            .eq('set_id', setId);
        return { data, error };
    },

    /**
     * Xóa một từ (word sense) khỏi một bộ từ vựng.
     * @param {string} setId - ID của bộ từ vựng.
     * @param {string} wordSenseId - ID của word_sense cần xóa.
     * @returns {Promise<{ error: Error | null }>}
     */
    removeWordFromSet: async (setId, wordSenseId) => {
        const { error } = await supabase
            .from('set_words')
            .delete()
            .eq('set_id', setId)
            .eq('word_sense_id', wordSenseId);
        return { error };
    },

    /**
     * Cập nhật hoặc chèn tiến trình học của người dùng cho một loạt các từ.
     * @param {Array<object>} progressUpdates - Mảng các đối tượng tiến trình cần cập nhật.
     * @returns {Promise<{ error: Error | null }>}
     */
    updateUserProgress: async (progressUpdates) => {
        const { error } = await supabase
            .from('user_progress')
            .upsert(progressUpdates);
        return { error };
    },

    /**
     * Lấy danh sách các từ cần ôn tập cho người dùng.
     * @param {string} userId - ID của người dùng.
     * @param {number} [limit=50] - Số lượng từ tối đa cần lấy.
     * @returns {Promise<{ data: any[], error: Error | null }>}
     */
    getDueReviewWords: async (userId, limit = 50) => {
        const { data, error } = await supabase
            .from('user_progress')
            .select(`
                word_senses (
                    id,
                    word_type,
                    meaning,
                    description,
                    example,
                    words (
                        word,
                        ipa
                    )
                )
            `)
            .eq('user_id', userId)
            .lte('review_due_at', new Date().toISOString()) // Lấy các từ có ngày ôn tập trong quá khứ hoặc hiện tại
            .order('review_due_at', { ascending: true }) // Ưu tiên từ quá hạn lâu nhất
            .limit(limit);
        return { data, error };
    },

    /**
     * Lấy số lượng từ cần ôn tập cho người dùng.
     * @param {string} userId - ID của người dùng.
     * @returns {Promise<{ count: number, error: Error | null }>}
     */
    getDueReviewWordsCount: async (userId) => {
        const { count, error } = await supabase
            .from('user_progress')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .lte('review_due_at', new Date().toISOString());
        
        return { count, error };
    },

    /**
     * Lấy thông tin hồ sơ public của người dùng.
     * @param {string} userId - ID của người dùng.
     * @returns {Promise<{ data: any, error: Error | null }>}
     */
    getProfile: async (userId) => {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        return { data, error };
    },

    /**
     * Cập nhật hồ sơ public của người dùng.
     * @param {string} userId - ID của người dùng.
     * @param {object} updates - Các trường cần cập nhật (e.g., { username, avatar_url }).
     * @returns {Promise<{ error: Error | null }>}
     */
    updateProfile: async (userId, updates) => {
        const { error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId);
        return { error };
    },

    /**
     * Tải lên một file ảnh đại diện.
     * @param {File} file - File ảnh.
     * @returns {Promise<{ data: { path: string }, error: Error | null }>}
     */
    uploadAvatar: async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `avatars/${fileName}`;

        const { data, error } = await supabase.storage
            .from('avatars') // 'avatars' là tên bucket của bạn trong Supabase Storage
            .upload(filePath, file);

        return { data, error };
    },

    /**
     * Cập nhật chi tiết của một từ (word và word_sense).
     * @param {string} wordId - ID của từ trong bảng `words`.
     * @param {string} senseId - ID của nghĩa trong bảng `word_senses`.
     * @param {object} updates - Đối tượng chứa các thông tin cập nhật.
     * @returns {Promise<{ error: Error | null }>}
     */
    updateWordDetails: async (wordId, senseId, updates) => {
        const wordUpdates = {
            word: updates.word,
            ipa: updates.ipa,
            cefr_level: updates.cefr,
        };
        const senseUpdates = {
            word_type: updates.word_type,
            meaning: updates.meaning,
            description: updates.description,
            example: updates.example,
        };

        // Cập nhật bảng `words`
        const { error: wordError } = await supabase.from('words').update(wordUpdates).eq('id', wordId);
        if (wordError) return { error: wordError };

        // Cập nhật bảng `word_senses`
        const { error: senseError } = await supabase.from('word_senses').update(senseUpdates).eq('id', senseId);
        return { error: senseError };
    },

    /**
     * Lấy thống kê cấp độ thành thạo của người dùng.
     * @param {string} userId - ID của người dùng.
     * @returns {Promise<{ data: any[], error: Error | null }>}
     */
    getMasteryLevelStats: async (userId) => {
        const { data, error } = await supabase
            .rpc('get_mastery_stats', { p_user_id: userId });
        return { data, error };
    },

    /**
     * Lấy các từ gây nhiễu cho game mode trắc nghiệm.
     * @param {string} setId - ID của bộ từ vựng.
     * @param {string} excludeSenseId - ID của nghĩa cần loại trừ (đáp án đúng).
     * @param {number} limit - Số lượng từ cần lấy.
     * @returns {Promise<{ data: any[], error: Error | null }>}
     */
    getDistractors: async (setId, excludeSenseId, limit) => {
        const { data, error } = await supabase
            .rpc('get_distractors', { p_set_id: setId, p_exclude_sense_id: excludeSenseId, p_limit: limit });
        return { data, error };
    },

    /**
     * Lưu hoặc cập nhật thông tin đăng ký push notification.
     * @param {object} subscription - Đối tượng PushSubscription.
     * @param {string} userId - ID của người dùng.
     * @returns {Promise<{ error: Error | null }>}
     */
    savePushSubscription: async (subscription, userId) => {
        const { error } = await supabase
            .from('push_subscriptions') // Bảng này cần được tạo
            .upsert({ endpoint: subscription.endpoint, subscription_details: subscription, user_id: userId }, { onConflict: 'endpoint' });
        return { error };
    }
};