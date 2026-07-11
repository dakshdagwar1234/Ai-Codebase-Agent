from sqlalchemy import Column, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import declarative_base, relationship
import datetime
import uuid

Base = declarative_base()

class ChatThread(Base):
    __tablename__ = "chat_threads"
    
    id = Column(String, primary_key=True, index=True) 
    name = Column(String, nullable=True)                  
    owner_token = Column(String, nullable=True)           
    username = Column(String, nullable=True)              
    target_repo_url = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    messages = relationship("ChatMessage", back_populates="thread", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    thread_id = Column(String, ForeignKey("chat_threads.id"))
    sender_role = Column(String, nullable=False)  # 'user', 'agent', 'system'
    content = Column(Text, nullable=False) 
    is_interrupt = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # relationship reverse mapping
    thread = relationship("ChatThread", back_populates="messages")