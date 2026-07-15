package com.opencollab.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opencollab.dto.CommentCreateRequest;
import com.opencollab.dto.CommentResponse;
import com.opencollab.entity.Comment;
import com.opencollab.entity.File;
import com.opencollab.exception.ResourceNotFoundException;
import com.opencollab.mapper.CommentMapper;
import com.opencollab.mapper.UserMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class CommentService {

    private final CommentMapper commentMapper;
    private final FileService fileService;
    private final UserMapper userMapper;

    public CommentService(CommentMapper commentMapper, FileService fileService, UserMapper userMapper) {
        this.commentMapper = commentMapper;
        this.fileService = fileService;
        this.userMapper = userMapper;
    }

    @Transactional(readOnly = true)
    public List<CommentResponse> listComments(Long fileId, Long userId) {
        // enforce read access
        fileService.getFileEntityById(fileId, userId);
        return commentMapper.selectList(
                new LambdaQueryWrapper<Comment>()
                        .eq(Comment::getFileId, fileId)
                        .orderByAsc(Comment::getCreatedAt))
                .stream()
                .map(comment -> toResponse(comment, resolveUsername(comment.getUserId())))
                .collect(Collectors.toList());
    }

    @Transactional
    public CommentResponse createComment(Long fileId, CommentCreateRequest request, Long userId) {
        File file = fileService.getFileEntityById(fileId, userId);
        if (file == null) {
            throw new ResourceNotFoundException("文件不存在");
        }
        Comment comment = new Comment();
        comment.setFileId(fileId);
        comment.setUserId(userId);
        comment.setCellRef(request.getCellRef());
        comment.setContent(request.getContent());
        comment.setIsResolved(false);
        commentMapper.insert(comment);
        return toResponse(comment, resolveUsername(userId));
    }

    public void deleteByFileId(Long fileId) {
        commentMapper.delete(new LambdaQueryWrapper<Comment>().eq(Comment::getFileId, fileId));
    }

    private String resolveUsername(Long userId) {
        com.opencollab.entity.User user = userMapper.selectById(userId);
        return user != null ? user.getUsername() : null;
    }

    private CommentResponse toResponse(Comment c, String username) {
        CommentResponse r = new CommentResponse();
        r.setId(c.getId());
        r.setFileId(c.getFileId());
        r.setUserId(c.getUserId());
        r.setUsername(username);
        r.setCellRef(c.getCellRef());
        r.setContent(c.getContent());
        r.setIsResolved(c.getIsResolved());
        r.setCreatedAt(c.getCreatedAt());
        r.setUpdatedAt(c.getUpdatedAt());
        return r;
    }
}
